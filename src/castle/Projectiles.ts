import * as THREE from 'three';
import type { PlayerState, Vec3 } from '../player/Player';
import { PLAYER_SIZE } from '../player/Player';
import { shadedBox } from '../render/shadedBox';

const ARROW_POOL = 24;
const ROCK_POOL = 12;
const GRAVITY = 18;

interface Shot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rock: boolean;
  damage: number;
  /** Seconds left; 0 when the shot is free for reuse. */
  life: number;
  radius: number;
}

/** Arrows and falling rocks from the traps. Fixed pools, recycled: no allocation while playing. */
export class Projectiles {
  private readonly shots: Shot[] = [];
  private readonly target = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const arrow = shadedBox(0.07, 0.07, 0.75);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x8a6a42, vertexColors: true });
    const rock = shadedBox(0.6, 0.6, 0.6);
    const rockMaterial = new THREE.MeshBasicMaterial({ color: 0x9a9282, vertexColors: true });
    for (let i = 0; i < ARROW_POOL + ROCK_POOL; i++) {
      const isRock = i >= ARROW_POOL;
      const mesh = new THREE.Mesh(isRock ? rock : arrow, isRock ? rockMaterial : arrowMaterial);
      mesh.visible = false;
      scene.add(mesh);
      this.shots.push({
        mesh,
        velocity: new THREE.Vector3(),
        rock: isRock,
        damage: 0,
        life: 0,
        radius: isRock ? 0.3 : 0.1,
      });
    }
  }

  get active(): number {
    return this.shots.filter((s) => s.life > 0).length;
  }

  fireArrow(from: Vec3, direction: Vec3, speed: number, damage: number): void {
    const shot = this.take(false);
    shot.mesh.position.set(from.x, from.y, from.z);
    shot.velocity.set(direction.x, direction.y, direction.z).normalize().multiplyScalar(speed);
    this.target.copy(shot.mesh.position).add(shot.velocity);
    shot.mesh.lookAt(this.target); // the box is long along its local z
    shot.damage = damage;
    shot.life = 3;
  }

  dropRock(at: Vec3, damage: number): void {
    const shot = this.take(true);
    shot.mesh.position.set(at.x, at.y, at.z);
    shot.mesh.rotation.set(Math.random(), Math.random(), 0);
    shot.velocity.set(0, 0, 0);
    shot.damage = damage;
    shot.life = 4;
  }

  /**
   * Moves the shots. One touching the player calls `hit` (with a point behind the shot, so
   * knockback follows its path) and vanishes; one meeting a block calls `land` and vanishes.
   */
  update(
    dt: number,
    isSolid: (x: number, y: number, z: number) => boolean,
    player: PlayerState,
    hit: (damage: number, from: Vec3) => void,
    land: (x: number, y: number, z: number, rock: boolean) => void,
  ): void {
    const p = player.position;
    const half = PLAYER_SIZE.width / 2;
    for (const shot of this.shots) {
      if (shot.life <= 0) continue;
      shot.life -= dt;
      const pos = shot.mesh.position;
      if (shot.rock) {
        shot.velocity.y -= GRAVITY * dt;
        shot.mesh.rotation.x += dt * 3;
      }
      pos.addScaledVector(shot.velocity, dt);

      const r = shot.radius;
      const touching =
        Math.abs(pos.x - p.x) < half + r &&
        Math.abs(pos.z - p.z) < half + r &&
        pos.y > p.y - r &&
        pos.y < p.y + PLAYER_SIZE.height + r;
      if (touching) {
        hit(shot.damage, { x: pos.x - shot.velocity.x, y: pos.y, z: pos.z - shot.velocity.z });
        this.free(shot);
      } else if (
        isSolid(Math.floor(pos.x), Math.floor(pos.y - (shot.rock ? r : 0)), Math.floor(pos.z))
      ) {
        land(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), shot.rock);
        this.free(shot);
      } else if (shot.life <= 0) {
        this.free(shot);
      }
    }
  }

  /** A free shot of the kind, or the oldest one in use. */
  private take(rock: boolean): Shot {
    let oldest: Shot | null = null;
    for (const shot of this.shots) {
      if (shot.rock !== rock) continue;
      if (shot.life <= 0) {
        shot.mesh.visible = true;
        return shot;
      }
      if (!oldest || shot.life < oldest.life) oldest = shot;
    }
    return oldest ?? this.shots[0];
  }

  private free(shot: Shot): void {
    shot.life = 0;
    shot.mesh.visible = false;
  }
}
