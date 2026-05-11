import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// *** CAR SETTINGS ***
const SPAWN               = new THREE.Vector3(0, 3, 0);
const CAR_ANGULAR_DAMPING = 1.0;
const MODEL_OFFSET_Y      = Math.PI / 2;
const MODEL_BODY_LIFT     = 0.50;  // shift car body mesh up relative to wheel center

// Chassis collider (box around car body only, wheels handled by raycasts)
const CHASSIS_W_FRAC      = 0.70;
const CHASSIS_H_FRAC      = 0.25;
const CHASSIS_L_FRAC      = 0.75;
const CHASSIS_OFFSET_Y    = 0.45;  // raise box so its bottom clears stair edges

// *** VEHICLE CONTROLLER SETTINGS ***
const ENGINE_FORCE        = 60.0;  // per-wheel force — keep low to avoid jumping
const BRAKE_FORCE         = 1.5;  // gentle — prevents snap-stop bounce
const STEER_MAX_ANGLE     = 0.65;
const STEER_SMOOTHING     = 0.15;
const STEER_PHYS_SIGN     = 1;
const COAST_STOP_TIME     = 1.5;  // seconds from throttle release to full stop
const STEER_REDUCE_SPEED_START = 4.0;  // m/s where steering starts to reduce
const STEER_REDUCE_SPEED_END   = 14.0; // m/s where min steering factor is reached
const STEER_MIN_FACTOR         = 0.35; // max speed steering = 35% of max steer angle
const BRAKE_STEER_FACTOR       = 0.18; // keep slight steer visual while off-throttle
const BRAKE_YAW_DAMP_RATE      = 18.0; // larger = stronger anti-spin yaw damping

// Suspension
const SUSP_STIFFNESS      = 25.0;
const SUSP_COMPRESSION    = 1.8;  // high compression = no bounce on stop
const SUSP_RELAXATION     = 1.2;  // high relaxation = no overshoot on rebound
const SUSP_REST_LEN       = 0.45;
const SUSP_MAX_TRAVEL     = 0.60;
const SUSP_MAX_FORCE      = 600.0;

// Tire
const WHEEL_FRICTION_SLIP = 4.0;   // lower = smoother acceleration, less spin-out
const WHEEL_SIDE_FRICTION = 1.4;
const WHEEL_RADIUS_BIAS   = 1.0;   // 1.0 = physics sphere matches visual wheel radius exactly

// Visual
const WHEEL_SPIN_DIR      = -1;
const HOOD_SYNC_SCALE     = 0.06; // smaller body response to suspension travel
const HOOD_SYNC_LERP      = 0.02; // slower body response
const HOOD_SYNC_MAX       = 0.03; // clamp excessive hood movement
const WHEEL_VISUAL_TRAVEL_SCALE = 0.55; // wheel mesh moves less than raw suspension travel
const BODY_PITCH_SCALE    = 0.35; // pitch from front/rear suspension delta
const BODY_PITCH_LERP     = 0.05; // pitch smoothing
const BODY_PITCH_MAX      = 0.16; // radians

export class CarObject {
  constructor(scene, world, gui) {
    this.scene   = scene;
    this.world   = world;
    this.loader  = new GLTFLoader();

    this.car         = { mesh: null, rigidBody: null };
    this.vehicle     = null;
    this.carBodyGroup = null;
    this.bodyLiftCurrent = 0;  // smoothed body Z offset
    this.bodyPitchCurrent = 0; // smoothed body X rotation
    this.coastTimer = COAST_STOP_TIME;
    this.coastStartVel = new THREE.Vector3();
    this.wasThrottle = false;
    this.wheelMeshes = { front: [], rear: [] };
    this.wheelPivots    = [];
    this.wheelInitQuats = [];
    this.wheelRadii     = [];  // physics radius per wheel
    this.frontCount     = 0;
    this.steerAngle     = 0;
    this.ready          = false;
    this.inputBlocked   = false;
    this.pressed        = {};

    window.addEventListener('keydown', (e) => { e.preventDefault(); this.pressed[e.code] = true; });
    window.addEventListener('keyup',   (e) => { e.preventDefault(); this.pressed[e.code] = false; });

    const f = gui.addFolder('Car');
    this.settings = {
      engineForce:   ENGINE_FORCE,
      maxSteer:      STEER_MAX_ANGLE,
      suspStiffness: SUSP_STIFFNESS,
      frictionSlip:  WHEEL_FRICTION_SLIP,
    };
    f.add(this.settings, 'engineForce',    10,  300, 5).name('Engine Force');
    f.add(this.settings, 'maxSteer',      0.1,  1.0, 0.05).name('Max Steer');
    f.add(this.settings, 'suspStiffness',   5,  100, 1).name('Susp Stiffness').onChange((v) => {
      if (!this.vehicle) return;
      for (let i = 0; i < this.vehicle.numWheels(); i++) this.vehicle.setWheelSuspensionStiffness(i, v);
    });
    f.add(this.settings, 'frictionSlip',  0.5,   30, 0.5).name('Tire Friction').onChange((v) => {
      if (!this.vehicle) return;
      for (let i = 0; i < this.vehicle.numWheels(); i++) this.vehicle.setWheelFrictionSlip(i, v);
    });

    this.loadCar(scene, world);
  }

  loadCar(scene, world) {
    this.loader.load(
      'LowPolyCars.gltf',
      (gltf) => {
        const carGroup = gltf.scene;
        carGroup.rotation.y = MODEL_OFFSET_Y;
        carGroup.updateMatrixWorld(true);

        const rawWheels = [];
        carGroup.traverse((obj) => {
          if (obj.isMesh && obj.name.toLowerCase().includes('whell')) rawWheels.push(obj);
        });

        const box    = new THREE.Box3().setFromObject(carGroup);
        const center = new THREE.Vector3();
        const size   = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        carGroup.position.sub(center);
        carGroup.updateMatrixWorld(true);

        const wrapper = new THREE.Group();
        wrapper.add(carGroup);
        scene.add(wrapper);

        const wheelData = rawWheels.map((w) => {
          const localBox    = new THREE.Box3().setFromBufferAttribute(w.geometry.attributes.position);
          const localCenter = new THREE.Vector3();
          localBox.getCenter(localCenter);

          const wb = new THREE.Box3().setFromObject(w);
          const wc = new THREE.Vector3();
          const ws = new THREE.Vector3();
          wb.getCenter(wc);
          wb.getSize(ws);
          const radius = Math.max(ws.x, ws.y, ws.z) * 0.5 * WHEEL_RADIUS_BIAS;
          return { mesh: w, pos: wc, radius, localCenter };
        });

        const avgZ      = wheelData.reduce((s, d) => s + d.pos.z, 0) / (wheelData.length || 1);
        const frontData = wheelData.filter(d => d.pos.z >= avgZ);
        const rearData  = wheelData.filter(d => d.pos.z <  avgZ);
        const allSorted = [...frontData, ...rearData];
        this.frontCount = frontData.length;

        allSorted.forEach(({ mesh, localCenter, radius }) => {
          mesh.geometry.translate(-localCenter.x, -localCenter.y, -localCenter.z);
          const pivot = new THREE.Object3D();
          pivot.position.copy(localCenter);
          mesh.parent.add(pivot);
          pivot.add(mesh);
          mesh.position.set(0, 0, 0);
          this.wheelPivots.push(pivot);
          this.wheelInitQuats.push(mesh.quaternion.clone());
          this.wheelRadii.push(radius);
        });

        this.wheelMeshes.front = allSorted.slice(0, this.frontCount).map(d => d.mesh);
        this.wheelMeshes.rear  = allSorted.slice(this.frontCount).map(d => d.mesh);

        // Lift only the body mesh geometry in car2-local -Z direction (= world +Y).
        // geometry.translate moves vertices only — pivots/physics are unaffected.
        carGroup.traverse(obj => {
          if (obj.isMesh && !obj.name.toLowerCase().includes('whell')) {
            obj.geometry.translate(0, 0, -MODEL_BODY_LIFT);
          }
        });

        this.carBodyGroup = carGroup;  // stored for suspension-driven hood animation

        const rigidBody = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
            .setAngularDamping(CAR_ANGULAR_DAMPING)
            .setAdditionalMass(8.0)  // heavier chassis = harder to flip/jump
        );

        world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            size.x * CHASSIS_W_FRAC / 2,
            size.y * CHASSIS_H_FRAC / 2,
            size.z * CHASSIS_L_FRAC / 2
          ).setTranslation(0, CHASSIS_OFFSET_Y, 0).setRestitution(0.05),
          rigidBody
        );

        const vehicle = world.createVehicleController(rigidBody);
        vehicle.indexUpAxis      = 1;
        vehicle.setIndexForwardAxis = 2;

        const suspDir = { x: 0, y: -1, z: 0 };
        const axleDir = { x: -1, y: 0, z: 0 };

        allSorted.forEach(({ pos, radius }) => {
          vehicle.addWheel(
            { x: pos.x, y: pos.y + SUSP_REST_LEN + radius, z: pos.z },
            suspDir,
            axleDir,
            SUSP_REST_LEN,
            radius
          );
        });

        for (let i = 0; i < vehicle.numWheels(); i++) {
          vehicle.setWheelSuspensionStiffness(i, SUSP_STIFFNESS);
          vehicle.setWheelSuspensionCompression(i, SUSP_COMPRESSION);
          vehicle.setWheelSuspensionRelaxation(i, SUSP_RELAXATION);
          vehicle.setWheelMaxSuspensionTravel(i, SUSP_MAX_TRAVEL);
          vehicle.setWheelMaxSuspensionForce(i, SUSP_MAX_FORCE);
          vehicle.setWheelFrictionSlip(i, WHEEL_FRICTION_SLIP);
          vehicle.setWheelSideFrictionStiffness(i, WHEEL_SIDE_FRICTION);
        }

        this.vehicle = vehicle;
        this.car     = { mesh: wrapper, rigidBody };
        this.ready   = true;
      },
      undefined,
      (err) => console.error('Car load error:', err)
    );
  }

  prePhysicsStep(dt) {
    if (!this.ready || !this.vehicle) return;

    const fwd   = !this.inputBlocked && !!this.pressed['KeyW'];
    const back  = !this.inputBlocked && !!this.pressed['KeyS'];
    const left  = !this.inputBlocked && !!this.pressed['KeyA'];
    const right = !this.inputBlocked && !!this.pressed['KeyD'];

    const throttleActive = fwd || back;
    const rb = this.car.rigidBody;

    const engineForce = fwd ? this.settings.engineForce : back ? -this.settings.engineForce : 0;
    let brake = 0;

    // Smooth stop over COAST_STOP_TIME instead of instant snap-stop.
    if (throttleActive) {
      this.wasThrottle = true;
      this.coastTimer = 0;
    } else {
      if (this.wasThrottle) {
        const lv = rb.linvel();
        this.coastStartVel.set(lv.x, 0, lv.z);
        this.coastTimer = 0;
        this.wasThrottle = false;
      }

      this.coastTimer = Math.min(COAST_STOP_TIME, this.coastTimer + dt);
      const k = 1 - (this.coastTimer / COAST_STOP_TIME);
      const lv = rb.linvel();
      rb.setLinvel({
        x: this.coastStartVel.x * k,
        y: lv.y,
        z: this.coastStartVel.z * k,
      }, true);

      if (this.coastTimer >= COAST_STOP_TIME) {
        brake = BRAKE_FORCE;
      }
    }

    const lvForSteer = rb.linvel();
    const hSpeed = Math.hypot(lvForSteer.x, lvForSteer.z);
    const t = THREE.MathUtils.clamp(
      (hSpeed - STEER_REDUCE_SPEED_START) / (STEER_REDUCE_SPEED_END - STEER_REDUCE_SPEED_START),
      0,
      1
    );
    const steerFactor = 1 - t * (1 - STEER_MIN_FACTOR);
    const steerAtSpeed = this.settings.maxSteer * steerFactor;
    const targetSteer = (left || right) ? (left ? 1 : -1) * steerAtSpeed : 0;
    this.steerAngle  += (targetSteer - this.steerAngle) * STEER_SMOOTHING;

    // Prevent spin-outs when braking/coasting while steering.
    const physicsSteer = throttleActive ? this.steerAngle : this.steerAngle * BRAKE_STEER_FACTOR;
    if (!throttleActive) {
      const av = rb.angvel();
      const yawKeep = Math.exp(-BRAKE_YAW_DAMP_RATE * dt);
      rb.setAngvel({ x: av.x, y: av.y * yawKeep, z: av.z }, true);
    }

    for (let i = 0; i < this.vehicle.numWheels(); i++) {
      this.vehicle.setWheelEngineForce(i, engineForce);
      this.vehicle.setWheelBrake(i, brake);
      if (i < this.frontCount) {
        this.vehicle.setWheelSteering(i, physicsSteer * STEER_PHYS_SIGN);
      }
    }

    this.vehicle.updateVehicle(dt);
  }

  _animateWheels() {
    const allWheels = [...this.wheelMeshes.front, ...this.wheelMeshes.rear];
    let suspDeltaSum = 0;
    let frontDeltaSum = 0;
    let rearDeltaSum = 0;
    let frontN = 0;
    let rearN = 0;

    allWheels.forEach((w, i) => {
      this.wheelPivots[i].rotation.z = -(i < this.frontCount ? this.steerAngle : 0);

      // Suspension travel: wheelSuspensionLength = ray distance (spring + radius),
      // so subtract radius to get pure spring delta relative to rest length.
      const rawLen = this.vehicle.wheelSuspensionLength(i) ?? (SUSP_REST_LEN + this.wheelRadii[i]);
      const suspDelta = (rawLen - this.wheelRadii[i]) - SUSP_REST_LEN;
      w.position.z = suspDelta * WHEEL_VISUAL_TRAVEL_SCALE;
      suspDeltaSum += suspDelta;
      if (i < this.frontCount) {
        frontDeltaSum += suspDelta;
        frontN++;
      } else {
        rearDeltaSum += suspDelta;
        rearN++;
      }

      const spinQ = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.vehicle.wheelRotation(i) * WHEEL_SPIN_DIR);
      w.quaternion.copy(this.wheelInitQuats[i]).multiply(spinQ);
    });

    // Sync hood: translate carGroup in car2-local Z by avg suspension delta.
    // When wheels compress (suspDelta < 0), body sinks down — matching real suspension.
    if (this.carBodyGroup) {
      const rawTarget = (suspDeltaSum / allWheels.length) * HOOD_SYNC_SCALE;
      const target = THREE.MathUtils.clamp(rawTarget, -HOOD_SYNC_MAX, HOOD_SYNC_MAX);
      this.bodyLiftCurrent += (target - this.bodyLiftCurrent) * HOOD_SYNC_LERP;
      this.carBodyGroup.position.z = this.bodyLiftCurrent;

      // Tilt body from front-vs-rear suspension: climbing lifts the nose.
      const frontAvg = frontN ? (frontDeltaSum / frontN) : 0;
      const rearAvg = rearN ? (rearDeltaSum / rearN) : 0;
      const rawPitch = (rearAvg - frontAvg) * BODY_PITCH_SCALE;
      const pitchTarget = THREE.MathUtils.clamp(rawPitch, -BODY_PITCH_MAX, BODY_PITCH_MAX);
      this.bodyPitchCurrent += (pitchTarget - this.bodyPitchCurrent) * BODY_PITCH_LERP;
      this.carBodyGroup.rotation.x = this.bodyPitchCurrent;
    }
  }

  getMesh() { return this.ready ? this.car.mesh : null; }

  reset() {
    if (!this.ready) return;
    const rb = this.car.rigidBody;
    rb.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true);
    rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.coastTimer = COAST_STOP_TIME;
    this.coastStartVel.set(0, 0, 0);
    this.wasThrottle = false;
    this.bodyLiftCurrent = 0;
    this.bodyPitchCurrent = 0;
    this.steerAngle = 0;
    if (this.carBodyGroup) {
      this.carBodyGroup.position.z = 0;
      this.carBodyGroup.rotation.x = 0;
    }
    this.wheelPivots.forEach((p) => { p.rotation.z = 0; });
  }

  update(dt = 1 / 60) {
    if (!this.ready) return;
    const t = this.car.rigidBody.translation();
    const r = this.car.rigidBody.rotation();
    this.car.mesh.position.set(t.x, t.y, t.z);
    this.car.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    this._animateWheels();
  }
}
