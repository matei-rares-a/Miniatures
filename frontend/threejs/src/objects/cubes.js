import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// *** CUBE SETTINGS ***
const CUBE_SPAWN  = [4, 3, -4];
const CUBE_SIZE   = 1;
const CUBE_COLOR  = 0x66aaff;
const CUBE_SPEED  = 6.0;
const CUBE_TURN   = 10.0;

export class CubeObject {
  constructor(scene, world, gui) {
    this.boxes = [];
    this.mainCube = null;
    this.inputBlocked = false;
    this.pressed = {};

    this.settings = { speed: CUBE_SPEED, turnSpeed: CUBE_TURN };
    const f = gui.addFolder('Cube');
    f.add(this.settings, 'speed',     1, 20, 0.5).name('Speed');
    f.add(this.settings, 'turnSpeed', 1, 30, 0.5).name('Turn Speed');

    this.makeCube(scene, world, { position: CUBE_SPAWN, size: CUBE_SIZE, color: CUBE_COLOR, name: 'Cube A' });
    this.mainCube = this.boxes[0];

    window.addEventListener('keydown', (e) => { e.preventDefault(); this.pressed[e.code] = true; });
    window.addEventListener('keyup',   (e) => { e.preventDefault(); this.pressed[e.code] = false; });
  }

  makeCube(scene, world, { position = [0, 1, 0], size = 1, color = 0x66aaff, name = 'cube' }) {
    const half    = size / 2;
    const geo     = new THREE.BoxGeometry(size, size, size);
    const baseMat = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6, wireframe: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x335577, metalness: 0.1, roughness: 0.6 });
    const mesh    = new THREE.Mesh(geo, [baseMat, baseMat, baseMat, baseMat, darkMat, baseMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);

    const rigidBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position[0], position[1], position[2])
        .setCanSleep(true)
        .setLinearDamping(5.0)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.8).setRestitution(0.2),
      rigidBody
    );

    this.boxes.push({ mesh, rigidBody });
    return { mesh, rigidBody };
  }

  processMovement() {
    if (this.inputBlocked) return;
    let moveX = 0, moveZ = 0, moveY = 0;
    if (this.pressed['KeyW']) moveZ -= 1;
    if (this.pressed['KeyS']) moveZ += 1;
    if (this.pressed['KeyA']) moveX -= 1;
    if (this.pressed['KeyD']) moveX += 1;
    if (this.pressed['Space']) moveY += 1;

    const dir = new THREE.Vector3(moveX, moveY, moveZ);
    if (dir.length() === 0) return;
    dir.normalize();

    this.mainCube.rigidBody.setLinvel(
      { x: dir.x * this.settings.speed, y: dir.y * this.settings.speed, z: dir.z * this.settings.speed },
      true
    );

    const targetAngle  = Math.atan2(dir.x, dir.z);
    const rot          = this.mainCube.rigidBody.rotation();
    const q            = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const currentAngle = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    let delta          = targetAngle - currentAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.mainCube.rigidBody.setAngvel({ x: 0, y: delta * this.settings.turnSpeed, z: 0 }, true);
  }

  updateMeshPositionByRigidBody(dict) {
    const t = dict.rigidBody.translation();
    const r = dict.rigidBody.rotation();
    dict.mesh.position.set(t.x, t.y, t.z);
    dict.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  resetCubes() {
    this.boxes.forEach((b, i) => {
      const p = i === 0 ? CUBE_SPAWN : [0, 1, 0];
      b.rigidBody.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
      b.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }

  reset() { this.resetCubes(); }

  update() {
    if (this.pressed['KeyR']) this.resetCubes();
    this.processMovement();
    for (const box of this.boxes) this.updateMeshPositionByRigidBody(box);
  }
}
