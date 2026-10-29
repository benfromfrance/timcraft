import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isBlockItem, itemTile } from '../items/items';
import { ATLAS_COLS, ATLAS_ROWS, BLOCKS } from '../world/blocks';
import { shadedBox } from './shadedBox';

const SKIN = 0xd9a77e;
const SLEEVE = 0x3a6fb8;
const CUFF = 0x2c5794;
const LIGHTS = { sky: 2.4, sun: 1.8 };

/** Geometries are built along +Y by three.js; the arm points down -Z. */
const alongZ = (geometry: THREE.BufferGeometry) => geometry.rotateX(-Math.PI / 2);
const SWING_DURATION = 0.28;
/** Rest pose of the arm rig in camera space (camera looks down -Z). */
const REST = { x: 0.56, y: -0.52, z: -0.42, pitch: 0.22, yaw: 0.18 };

/** Sets a geometry's UVs (in [0, 1]) to one atlas tile per face group of 4 vertices. */
function mapToTiles(geometry: THREE.BufferGeometry, tileOfFace: (face: number) => number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const tile = tileOfFace(Math.floor(i / 4));
    const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
    const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
    uv.setXY(i, u0 + uv.getX(i) / ATLAS_COLS, v0 + uv.getY(i) / ATLAS_ROWS);
  }
  uv.needsUpdate = true;
}

/**
 * First-person arm and held item, drawn in their own scene over the world (so they never
 * clip into walls). Swings when hitting, bobs while walking.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  private readonly rig = new THREE.Group();
  /** Where the held item attaches, at the hand. */
  private readonly hand = new THREE.Group();
  private held: THREE.Object3D | null = null;
  private heldId: number | null | undefined = undefined;
  private swing = 1;
  private bobPhase = 0;
  private readonly blockMaterial: THREE.MeshBasicMaterial;
  private readonly spriteMaterial: THREE.MeshBasicMaterial;
  private readonly skyLight = new THREE.HemisphereLight(0xffffff, 0x50505a, LIGHTS.sky);
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, LIGHTS.sun);

  constructor(atlas: THREE.Texture) {
    this.blockMaterial = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
    this.spriteMaterial = new THREE.MeshBasicMaterial({
      map: atlas,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    // Rounded, lit shapes (unlike the voxel world) so the arm reads as an arm.
    this.sunLight.position.set(-1, 2, 1.5);
    this.scene.add(this.skyLight, this.sunLight);
    const skin = new THREE.MeshLambertMaterial({ color: SKIN });
    const sleeveMaterial = new THREE.MeshLambertMaterial({ color: SLEEVE });

    const sleeve = new THREE.Mesh(alongZ(new THREE.CapsuleGeometry(0.095, 0.3, 6, 16)), sleeveMaterial);
    sleeve.position.z = -0.2;
    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.093, 0.022, 8, 24),
      new THREE.MeshLambertMaterial({ color: CUFF }),
    );
    cuff.position.z = -0.42;
    // Forearm narrows toward the wrist (the cylinder's top ends up at the wrist, along -Z).
    const forearm = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(0.058, 0.078, 0.3, 16)), skin);
    forearm.position.z = -0.56;
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), skin);
    wrist.position.z = -0.7;

    // Closed fist: rounded palm, a row of knuckles on top, and the thumb along the inner side.
    const fist = new THREE.Group();
    fist.position.set(0, 0.005, -0.78);
    fist.add(new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.11, 0.14, 3, 0.04), skin));
    for (let i = 0; i < 4; i++) {
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skin);
      knuckle.position.set(-0.045 + i * 0.03, 0.045, -0.05);
      fist.add(knuckle);
    }
    const thumb = new THREE.Mesh(alongZ(new THREE.CapsuleGeometry(0.023, 0.06, 4, 10)), skin);
    thumb.position.set(-0.062, 0.02, -0.03);
    thumb.rotation.y = 0.35;
    fist.add(thumb);

    this.hand.position.set(0, 0.03, -0.78);
    this.rig.add(sleeve, cuff, forearm, wrist, fist, this.hand);
    this.scene.add(this.rig);
    this.applyPose(0, 0, 0);
  }

  /** Shows a block, a tool sprite, or nothing (bare hand) in the hand. */
  setHeld(id: number | null): void {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.held) {
      this.hand.remove(this.held);
      this.held.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      this.held = null;
    }
    if (id === null) return;

    if (isBlockItem(id)) {
      const tiles = BLOCKS[id].tiles;
      const geometry = shadedBox(0.26, 0.26, 0.26);
      mapToTiles(geometry, (face) => (face === 2 ? tiles.top : face === 3 ? tiles.bottom : tiles.side));
      const cube = new THREE.Mesh(geometry, this.blockMaterial);
      cube.rotation.set(0.2, Math.PI / 4, 0);
      cube.position.y = 0.08;
      this.held = cube;
    } else {
      const geometry = new THREE.PlaneGeometry(0.62, 0.62);
      const tile = itemTile(id);
      mapToTiles(geometry, () => tile);
      const sprite = new THREE.Mesh(geometry, this.spriteMaterial);
      // The sprite is drawn diagonally (handle bottom-left): turn it upright, handle in the fist.
      sprite.rotation.z = Math.PI / 4;
      sprite.position.y = 0.3;
      const pivot = new THREE.Group();
      pivot.rotation.set(-0.55, -0.45, 0); // lean forward, show a bit of the side
      pivot.add(sprite);
      this.held = pivot;
    }
    this.hand.add(this.held);
  }

  /** Dims the arm and held item at night, like the world (`brightness` 0 … 1). */
  setLight(brightness: number): void {
    this.skyLight.intensity = LIGHTS.sky * brightness;
    this.sunLight.intensity = LIGHTS.sun * brightness;
    this.blockMaterial.color.setScalar(brightness);
    this.spriteMaterial.color.setScalar(brightness);
  }

  /** Starts a swing (restarts it if one is already playing). */
  swingArm(): void {
    this.swing = 0;
  }

  /** `walkSpeed` in blocks/s while on the ground (0 when still or airborne). */
  update(dt: number, walkSpeed: number, aspect: number): void {
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.swing = Math.min(1, this.swing + dt / SWING_DURATION);
    this.bobPhase += dt * walkSpeed * 1.8;
    const bob = Math.min(1, walkSpeed / 4.3);
    this.applyPose(Math.sin(this.swing * Math.PI), this.bobPhase, bob);
  }

  private applyPose(swing: number, phase: number, bob: number): void {
    // Swing: punch forward and inward toward the crosshair, with a slight upward flick.
    this.rig.position.set(
      REST.x - swing * 0.16 + Math.cos(phase) * 0.018 * bob,
      REST.y + swing * 0.04 - Math.abs(Math.sin(phase)) * 0.025 * bob,
      REST.z - swing * 0.22,
    );
    this.rig.rotation.set(REST.pitch + swing * 0.45, REST.yaw + swing * 0.5, 0);
  }
}
