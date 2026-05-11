import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { CubeObject } from './objects/cubes';
import { CarObject } from './objects/car';
import {RapierDebugRenderer} from './objects/RapierDebugRenderer'
import GUI from 'lil-gui'
//https://github.com/brunosimon/folio-2019/tree/master/static/models/car
/**
 * Debug
 */
const gui = new GUI()

// *** GLOBAL SETTINGS ***
const SCENE_BG_COLOR    = 0xd2f7ff;
const GRAVITY_Y         = -20.81;
const GROUND_COLOR      = 0x4caf50;
const GROUND_SIZE       = 40;
const GROUND_THICKNESS  = 0.5;
const GROUND_FRICTION   = 0.5;
const FREE_CAM_SPEED    = 10.0;
const FREE_CAM_SENS     = 0.002;
// const PLATFORM_COLOR = 0x8d6e63; // brown (original)
const PLATFORM_COLOR     = 0xff00ff; // debug magenta
const STAIR_STEP_H       = 0.15;    // half-height per step (full = 0.3 unit — thin enough for car to climb)
// Cascade platforms (adjacent/touching, descending)
const PLATFORM_CONFIGS  = [
  { x:  27, y:  -5, z:   0, w: 14, d: 12 },
  { x:  27, y: -13, z:  13, w: 12, d: 14 },
  { x:   9, y: -22, z:  13, w: 12, d: 12 },
];
// Stairs: steps go toward +z edge of ground, each step 0.3 unit tall, 6 units deep
const STAIR_CONFIGS = [
  { x: 0, y: STAIR_STEP_H * 1, z:  14, w: 32, d: 12, t: STAIR_STEP_H }, // step 1 top=0.30
  { x: 0, y: STAIR_STEP_H * 3, z:  17, w: 24, d:  6, t: STAIR_STEP_H }, // step 2 top=0.60
  { x: 0, y: STAIR_STEP_H * 5, z:  19, w: 16, d:  2, t: STAIR_STEP_H }, // step 3 top=0.90
];
const CAM_FOV           = 60;
const CAM_NEAR          = 0.1;
const CAM_FAR           = 300;
const CAM_INIT_POS      = { x: 0, y: 12, z: -11 };
const CAM_LERP          = 0.1;
const CAM_OFFSET        = { ...CAM_INIT_POS };
const CAM_TARGET_LERP   = 0.1;
const CAM_SCROLL_STEP   = 1.5;
const CAM_SCROLL_MIN    = 4;
const CAM_SCROLL_MAX    = 60;
const LIGHT_COLOR       = 0xffffff;
const LIGHT_INTENSITY   = 5;
const LIGHT_POS         = { x: 5, y: 10, z: 4 };
const FIXED_TIMESTEP    = 1 / 60;
const MAX_DT            = 0.033;
// --- Global camera settings ---
const CAMERA_MODE = { mode: 'fixed' }; // 'follow' | 'fixed' | 'independent'

// Free-fly camera state
const freeCam = {
  yaw: 0, pitch: 0,
  keys: {},
};
window.addEventListener('keydown', (e) => { freeCam.keys[e.code] = true; });
window.addEventListener('keyup',   (e) => { freeCam.keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  freeCam.yaw   -= e.movementX * FREE_CAM_SENS;
  freeCam.pitch -= e.movementY * FREE_CAM_SENS;
  freeCam.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, freeCam.pitch));
});

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('click', () => {
  if (CAMERA_MODE.mode === 'independent') renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('wheel', (e) => {
  if (CAMERA_MODE.mode === 'independent') return;
  e.preventDefault();
  const step = e.deltaY > 0 ? -CAM_SCROLL_STEP : CAM_SCROLL_STEP;
  camOffset.z = Math.max(-CAM_SCROLL_MAX, Math.min(-CAM_SCROLL_MIN, camOffset.z + step));
  camOffset.y = Math.max(1, Math.min(50, camOffset.y - step * 0.5));
  ctrlOffsetY.updateDisplay();
  ctrlOffsetZ.updateDisplay();
}, { passive: false });

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENE_BG_COLOR);

//Camera settings
const camera = new THREE.PerspectiveCamera(CAM_FOV, innerWidth / innerHeight, CAM_NEAR, CAM_FAR);
camera.position.set(CAM_INIT_POS.x, CAM_INIT_POS.y, CAM_INIT_POS.z);


const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = true; // 'fixed' is the default mode

const camOffset = { x: CAM_OFFSET.x, y: CAM_OFFSET.y, z: CAM_OFFSET.z };
const camGui = gui.addFolder('Camera');
camGui.add(CAMERA_MODE, 'mode', ['follow', 'fixed', 'independent']).name('mode').onChange((v) => {
  controls.enabled = (v === 'fixed');
  const blocked = (v === 'independent');
  CAR.inputBlocked  = blocked;
  CUBES.inputBlocked = blocked;
  if (v !== 'independent' && document.pointerLockElement) document.exitPointerLock();
  if (v === 'independent') {
    freeCam.yaw   = Math.atan2(camera.getWorldDirection(new THREE.Vector3()).x,
                               camera.getWorldDirection(new THREE.Vector3()).z);
    freeCam.pitch = 0;
  }
});
const ctrlOffsetX = camGui.add(camOffset, 'x', -30, 30, 0.1).name('offset X');
const ctrlOffsetY = camGui.add(camOffset, 'y',   0, 50, 0.1).name('offset Y');
const ctrlOffsetZ = camGui.add(camOffset, 'z', -70, 70, 0.1).name('offset Z');

// Lights
// const hemi = new THREE.HemisphereLight(0xd2f7ff, 0x222222, 1);
// scene.add(hemi);
const dir = new THREE.DirectionalLight(LIGHT_COLOR, LIGHT_INTENSITY);
dir.position.set(LIGHT_POS.x, LIGHT_POS.y, LIGHT_POS.z);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
scene.add(dir);

// --- Rapier physics setup ---
await RAPIER.init();
const gravity = { x: 0.0, y: GRAVITY_Y, z: 0.0 };
const world = new RAPIER.World(gravity);

// Ground (visual)
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ color: GROUND_COLOR, metalness: 0.0, roughness: 1.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Ground (physics): large static box under y=0
const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -GROUND_THICKNESS, 0);
const groundBody = world.createRigidBody(groundBodyDesc);
const groundColliderDesc = RAPIER.ColliderDesc.cuboid(GROUND_SIZE / 2, GROUND_THICKNESS, GROUND_SIZE / 2).setFriction(GROUND_FRICTION);
world.createCollider(groundColliderDesc, groundBody);

// Sub-platforms
const platformMeshes = [];
function createPlatform(x, y, z, w, d, thick = GROUND_THICKNESS) {
  const mat  = new THREE.MeshStandardMaterial({ color: PLATFORM_COLOR, metalness: 0.0, roughness: 1.0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thick * 2, d), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  platformMeshes.push(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(w / 2, thick, d / 2).setFriction(GROUND_FRICTION),
    body
  );
}
PLATFORM_CONFIGS.forEach(({ x, y, z, w, d }) => createPlatform(x, y, z, w, d));
STAIR_CONFIGS.forEach(({ x, y, z, w, d, t }) => createPlatform(x, y, z, w, d, t));

// Platform color picker in debug GUI
const platGui = gui.addFolder('Platforms');
const platSettings = { color: `#${PLATFORM_COLOR.toString(16).padStart(6, '0')}` };
platGui.addColor(platSettings, 'color').name('Color').onChange((hex) => {
  platformMeshes.forEach(m => m.material.color.set(hex));
});

// Handle resize
// addEventListener('resize', () => {
//   camera.aspect = innerWidth / innerHeight;
//   camera.updateProjectionMatrix();
//   renderer.setSize(innerWidth + 10, innerHeight + 10);
// });


//Declaration of objects--------------------------------------

const CUBES = new CubeObject(scene, world, gui)
CUBES.inputBlocked = true; // disabled
CUBES.mainCube.mesh.visible = false;
const CAR   = new CarObject(scene, world, gui)
const debugRenderer = new RapierDebugRenderer(scene, world, gui);

// Ctrl+R: reset all objects
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyR') {
    e.preventDefault();
    CAR.reset();
    CUBES.reset();
  }
});


// --- Animation loop with fixed-step accumulator ---
let last = performance.now();
let accumulator = 0;

//main function--------------------------------------------
function animate(now = performance.now()) {
  requestAnimationFrame(animate);

  // Step physics at a fixed rate for stability
  const dt = Math.min(MAX_DT, (now - last) / 1000);
  last = now;
  accumulator += dt;
  while (accumulator >= FIXED_TIMESTEP) {
    CAR.prePhysicsStep(FIXED_TIMESTEP); // apply engine/steer/brake + updateVehicle BEFORE step
    world.step();
    accumulator -= FIXED_TIMESTEP;
  }
  //Use of objects--------------------------------------------

  // CUBES.update(); // disabled
  CAR.update(dt);
  debugRenderer.update();

  // Camera modes
  const carMesh = CAR.getMesh();
  if (CAMERA_MODE.mode === 'independent') {
    // Free-fly: WASD moves camera, mouse look
    const q = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(freeCam.pitch, freeCam.yaw, 0, 'YXZ'));
    camera.quaternion.copy(q);
    const move = new THREE.Vector3();
    if (freeCam.keys['KeyW']) move.z -= 1;
    if (freeCam.keys['KeyS']) move.z += 1;
    if (freeCam.keys['KeyA']) move.x -= 1;
    if (freeCam.keys['KeyD']) move.x += 1;
    if (freeCam.keys['Space'])    move.y += 1;
    if (freeCam.keys['ShiftLeft']) move.y -= 1;
    if (move.length() > 0) {
      move.normalize().applyQuaternion(q).multiplyScalar(FREE_CAM_SPEED * dt);
      camera.position.add(move);
    }
  } else if (carMesh) {
    if (CAMERA_MODE.mode === 'follow') {
      // Smooth follow behind the car
      const offset = new THREE.Vector3(camOffset.x, camOffset.y, camOffset.z);
      offset.applyQuaternion(carMesh.quaternion);
      camera.position.lerp(carMesh.position.clone().add(offset), CAM_LERP);
      camera.lookAt(carMesh.position);
    } else {
      // Fixed: OrbitControls active, keep target on car
      controls.target.lerp(carMesh.position, CAM_TARGET_LERP);
      controls.update();
    }
  }

  //End of main function---------------------------------------
  renderer.render(scene, camera);
}
animate();
