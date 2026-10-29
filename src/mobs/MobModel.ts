import * as THREE from 'three';
import { shadedBox } from '../render/shadedBox';
import { Flames } from './Flames';

const HURT = new THREE.Color(0xff3030);
const FIRE_GLOW = new THREE.Color(0xff6a20);
const FIRE_EYES = new THREE.Color(0xff4a10);

export interface MobPose {
  /** Walk cycle angle, radians. */
  walkPhase: number;
  /** 0 standing still … 1 full stride. */
  walkAmount: number;
  /** 0 … 1, striking. */
  attack: number;
  /** 0 … 1, red flash after being hit. */
  hurt: number;
  /** 0 … 1, falling over when killed. */
  death: number;
  /** World brightness (day/night), multiplies the colours. */
  light: number;
  /** 0 … 1, ablaze at night. */
  fire: number;
}

interface Leg {
  pivot: THREE.Group;
  /** Offset in the walk cycle (legs on opposite phases alternate). */
  phase: number;
}

/**
 * A mob made of boxes, assembled by the builders in mobTypes.ts. Faces -Z like the player.
 * Shared rig: swinging legs, arms that strike forward, an optional body that rears up.
 */
export class MobModel {
  readonly root = new THREE.Group();
  readonly legs: Leg[] = [];
  readonly arms: THREE.Group[] = [];
  /** Tilted back when attacking (for mobs without arms). */
  tilt: THREE.Group | null = null;
  legSwing = 0.7;
  private readonly tinted: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private readonly eyes: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private flames: Flames | null = null;

  /** Adds a shaded box of `color` to `parent` (the root by default). */
  part(
    size: [number, number, number],
    color: number,
    position: [number, number, number],
    parent: THREE.Object3D = this.root,
  ): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    this.tinted.push({ material, base: material.color.clone() });
    const mesh = new THREE.Mesh(shadedBox(...size), material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  /** A box hanging below a joint at `joint`: rotating the returned group swings it. */
  limb(
    size: [number, number, number],
    color: number,
    joint: [number, number, number],
    parent: THREE.Object3D = this.root,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(...joint);
    this.part(size, color, [0, -size[1] / 2, 0], pivot);
    parent.add(pivot);
    return pivot;
  }

  leg(pivot: THREE.Group, phase: number): void {
    this.legs.push({ pivot, phase });
  }

  /** Unshaded box that stays bright at night and turns orange when ablaze. */
  eye(size: [number, number, number], color: number, position: [number, number, number], parent: THREE.Object3D = this.root): void {
    const material = new THREE.MeshBasicMaterial({ color });
    this.eyes.push({ material, base: material.color.clone() });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    parent.add(mesh);
  }

  addFlames(width: number, height: number): void {
    this.flames = new Flames(width, height);
    this.root.add(this.flames.group);
  }

  pose({ walkPhase, walkAmount, attack, hurt, death, light, fire }: MobPose, dt: number): void {
    for (const { pivot, phase } of this.legs) {
      pivot.rotation.x = Math.sin(walkPhase + phase) * this.legSwing * walkAmount;
    }
    // Positive x rotation swings a hanging limb forward (toward -Z).
    const armSwing = Math.sin(walkPhase) * 0.55 * walkAmount;
    this.arms.forEach((arm, i) => (arm.rotation.x = (i % 2 ? armSwing : -armSwing) + attack * 1.5));
    if (this.tilt) this.tilt.rotation.x = attack * 0.5;

    for (const { material, base } of this.tinted) {
      material.color.copy(base).multiplyScalar(light).lerp(FIRE_GLOW, fire * 0.3).lerp(HURT, hurt * 0.7);
    }
    for (const { material, base } of this.eyes) material.color.copy(base).lerp(FIRE_EYES, fire);
    this.flames?.update(dt, fire * (1 - death));
    this.root.rotation.z = death * (Math.PI / 2);
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.shared) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    });
  }
}
