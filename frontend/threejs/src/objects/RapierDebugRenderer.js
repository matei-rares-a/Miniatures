import * as THREE from 'three';

// *** DEBUG RENDERER SETTINGS ***
const DEBUG_ENABLED = true;
const DEBUG_COLOR   = 0xffffff;

export class RapierDebugRenderer {
  constructor(scene, world, gui) {
    this.world   = world;
    this.settings = { enabled: DEBUG_ENABLED };
    this.mesh    = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: DEBUG_COLOR, vertexColors: true })
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const f = gui.addFolder('Debug Renderer');
    f.add(this.settings, 'enabled').name('Show Colliders');
  }

  update() {
    if (this.settings.enabled) {
      const { vertices, colors } = this.world.debugRender();
      this.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      this.mesh.geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 4));
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}