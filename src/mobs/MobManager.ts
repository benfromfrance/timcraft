import type * as THREE from 'three';
import { stepPlayer, type BodySize } from '../player/Physics';
import type { PlayerState, Vec3 } from '../player/Player';
import { rayBox } from '../player/Raycast';
import { BlockId } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';
import { toChunkCoord } from '../world/coords';
import type { World } from '../world/World';
import { createBrain, think, type Behavior, type MobBrain } from './mobAI';
import type { MobModel } from './MobModel';
import { pickMobType, type MobType } from './mobTypes';

/** Day: a few stragglers. Night: many more, ablaze and enraged. */
const SPAWN_RULES = {
  day: { maxMobs: 3, interval: 6 },
  night: { maxMobs: 10, interval: 2.5 },
};
const SPAWN_MIN_DISTANCE = 20;
const SPAWN_MAX_DISTANCE = 32;
const DESPAWN_DISTANCE = 72;
const DEATH_DURATION = 0.8;
const KNOCKBACK_SPEED = 7;
const KNOCKBACK_LIFT = 5.5;
/** How fast mobs catch fire at nightfall / burn out at dawn (per second). */
const FIRE_RATE = 0.8;
/** Enraged (burning) mobs: faster, see further, hit harder. */
const RAGE = { speed: 1.3, range: 1.5, damage: 1.5 };
const LEAP = { minDistance: 2, maxDistance: 5, speed: 8.5, lift: 6.5, cooldown: 2.5 };
const PLAYER_HEIGHT = 1.8;

export interface Mob {
  type: MobType;
  body: PlayerState;
  brain: MobBrain;
  model: MobModel;
  health: number;
  blocked: boolean;
  attackCooldown: number;
  leapCooldown: number;
  /** 0 … 1, ablaze at night. */
  fire: number;
  /** Animation timers, counting down to 0 (death counts up from 0 once killed). */
  attackAnim: number;
  hurtTimer: number;
  deathTimer: number | null;
  walkPhase: number;
}

export interface SkyState {
  night: boolean;
  /** World brightness, applied to mob colours. */
  light: number;
}

/** Spawns, simulates and renders hostile mobs around the player. */
export class MobManager {
  readonly mobs: Mob[] = [];
  /** Called when a mob strikes the player; `from` is the attacker's position. */
  onPlayerHit: (damage: number, from: Vec3, knockback: number) => void = () => {};
  private spawnTimer = SPAWN_RULES.day.interval;

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
  ) {}

  get aliveCount(): number {
    return this.mobs.filter((m) => m.deathTimer === null).length;
  }

  /** Fixed-step simulation. Mobs only chase and attack when `hostile` (survival mode). */
  step(dt: number, player: PlayerState, hostile: boolean): void {
    const isSolid = (x: number, y: number, z: number) => this.world.isSolid(x, y, z);
    for (const mob of this.mobs) {
      const p = mob.body.position;
      // Frozen while its chunk is not loaded (it would fall through the world).
      if (!this.world.getChunk(toChunkCoord(p.x), toChunkCoord(p.z))) continue;
      const alive = mob.deathTimer === null;
      const enraged = mob.fire > 0.5;
      const target = alive && hostile ? player.position : null;

      const move = think(mob.body, mob.brain, target, mob.blocked, dt, Math.random, this.behavior(mob, enraged));
      if (!alive) move.forward = 0;
      mob.leapCooldown = Math.max(0, mob.leapCooldown - dt);
      if (target && mob.type.leaps) this.tryLeap(mob, target);
      mob.blocked = stepPlayer(mob.body, move, dt, isSolid, mob.type.size);

      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      if (target && mob.attackCooldown === 0 && this.inReach(mob, player)) {
        mob.attackCooldown = mob.type.attackCooldown;
        mob.attackAnim = 1;
        const damage = Math.round(mob.type.damage * (enraged ? RAGE.damage : 1));
        this.onPlayerHit(damage, { ...p }, mob.type.knockbackDealt);
      }
    }
    this.separate();
  }

  /** Per-frame work: spawning, despawning, fire, animation. */
  update(dt: number, player: PlayerState, sky: SkyState): void {
    const rules = sky.night ? SPAWN_RULES.night : SPAWN_RULES.day;
    this.spawnTimer = Math.min(this.spawnTimer - dt, rules.interval);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = rules.interval;
      if (this.aliveCount < rules.maxMobs) this.trySpawn(player.position, sky.night);
    }

    for (const mob of [...this.mobs]) {
      const p = mob.body.position;
      const far = Math.hypot(p.x - player.position.x, p.z - player.position.z) > DESPAWN_DISTANCE;
      if (mob.deathTimer !== null) mob.deathTimer += dt;
      if (far || (mob.deathTimer ?? 0) > DEATH_DURATION) {
        this.remove(mob);
        continue;
      }

      const fireTarget = sky.night ? 1 : 0;
      mob.fire += Math.sign(fireTarget - mob.fire) * Math.min(Math.abs(fireTarget - mob.fire), dt * FIRE_RATE);
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      mob.attackAnim = Math.max(0, mob.attackAnim - dt * 3);
      const speed = Math.hypot(mob.body.velocity.x, mob.body.velocity.z);
      mob.walkPhase += speed * dt * 2.6;

      mob.model.root.position.set(p.x, p.y, p.z);
      mob.model.root.rotation.y = mob.body.yaw;
      mob.model.pose(
        {
          walkPhase: mob.walkPhase,
          walkAmount: Math.min(1, speed / 3),
          attack: Math.sin(mob.attackAnim * Math.PI),
          hurt: mob.hurtTimer / 0.3,
          death: mob.deathTimer === null ? 0 : Math.min(1, mob.deathTimer / 0.4),
          light: sky.light,
          fire: mob.fire,
        },
        dt,
      );
    }
  }

  /** Closest living mob hit by a ray, within `maxDistance`. */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): { mob: Mob; distance: number } | null {
    let best: { mob: Mob; distance: number } | null = null;
    for (const mob of this.mobs) {
      if (mob.deathTimer !== null) continue;
      const p = mob.body.position;
      const half = mob.type.size.width / 2;
      const min = { x: p.x - half, y: p.y, z: p.z - half };
      const max = { x: p.x + half, y: p.y + mob.type.size.height, z: p.z + half };
      const t = rayBox(origin, dir, min, max, maxDistance);
      if (t !== null && (!best || t < best.distance)) best = { mob, distance: t };
    }
    return best;
  }

  /** Damages a mob and knocks it away from `from`. Returns true if it died. */
  hit(mob: Mob, damage: number, from: Vec3): boolean {
    if (mob.deathTimer !== null) return false;
    mob.health -= damage;
    mob.hurtTimer = 0.3;
    const strength = 1 - mob.type.knockbackResist;
    const v = mob.body.velocity;
    const dx = mob.body.position.x - from.x;
    const dz = mob.body.position.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    v.x = (dx / len) * KNOCKBACK_SPEED * strength;
    v.z = (dz / len) * KNOCKBACK_SPEED * strength;
    v.y = KNOCKBACK_LIFT * strength;
    if (strength > 0.3) mob.body.onGround = false; // keeps air control low so the knockback carries
    if (mob.health > 0) return false;
    mob.deathTimer = 0;
    return true;
  }

  /** Removes every mob within `radius` (used on respawn). */
  clearNear(position: Vec3, radius: number): void {
    for (const mob of [...this.mobs]) {
      const p = mob.body.position;
      if (Math.hypot(p.x - position.x, p.z - position.z) < radius) this.remove(mob);
    }
  }

  spawnAt(position: Vec3, type: MobType, fire = 0): Mob {
    const model = type.createModel();
    this.scene.add(model.root);
    const mob: Mob = {
      type,
      body: {
        position,
        velocity: { x: 0, y: 0, z: 0 },
        yaw: Math.random() * Math.PI * 2,
        pitch: 0,
        onGround: false,
        flying: false,
      },
      brain: createBrain(),
      model,
      health: type.health,
      blocked: false,
      attackCooldown: type.attackCooldown,
      leapCooldown: LEAP.cooldown,
      fire,
      attackAnim: 0,
      hurtTimer: 0,
      deathTimer: null,
      walkPhase: 0,
    };
    this.mobs.push(mob);
    return mob;
  }

  private behavior(mob: Mob, enraged: boolean): Behavior {
    const t = mob.type;
    return {
      chaseRange: t.chaseRange * (enraged ? RAGE.range : 1),
      chaseSpeed: t.chaseSpeed * (enraged ? RAGE.speed : 1),
      wanderSpeed: t.wanderSpeed,
      stopDistance: t.attackRange * 0.7,
    };
  }

  /** Pounces at the target from a few blocks away. */
  private tryLeap(mob: Mob, target: Vec3): void {
    const p = mob.body.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (!mob.body.onGround || mob.leapCooldown > 0) return;
    if (distance < LEAP.minDistance || distance > LEAP.maxDistance) return;
    mob.leapCooldown = LEAP.cooldown;
    mob.body.velocity.x = (dx / distance) * LEAP.speed;
    mob.body.velocity.z = (dz / distance) * LEAP.speed;
    mob.body.velocity.y = LEAP.lift;
    mob.body.onGround = false;
    mob.attackAnim = 1; // rears up while jumping
  }

  private inReach(mob: Mob, player: PlayerState): boolean {
    const m = mob.body.position;
    const p = player.position;
    const overlapY = p.y < m.y + mob.type.size.height && p.y + PLAYER_HEIGHT > m.y;
    return overlapY && Math.hypot(p.x - m.x, p.z - m.z) < mob.type.attackRange;
  }

  /** Spawns on the surface of a random loaded column, away from the player. */
  private trySpawn(center: Vec3, night: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_MIN_DISTANCE + Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    const x = Math.floor(center.x + Math.cos(angle) * distance);
    const z = Math.floor(center.z + Math.sin(angle) * distance);
    if (!this.world.getChunk(toChunkCoord(x), toChunkCoord(z))) return;

    for (let y = CHUNK_HEIGHT - 1; y > 0; y--) {
      const id = this.world.getBlock(x, y, z);
      if (id === BlockId.AIR) continue;
      if (id === BlockId.LEAVES) return; // not on treetops
      const type = pickMobType(night, Math.random);
      const position = { x: x + 0.5, y: y + 1, z: z + 0.5 };
      if (this.fits(position.x, position.y, position.z, type.size)) this.spawnAt(position, type, night ? 1 : 0);
      return;
    }
  }

  /** Pushes overlapping mobs apart, unless that would push them into a block. */
  private separate(): void {
    for (let i = 0; i < this.mobs.length; i++) {
      for (let j = i + 1; j < this.mobs.length; j++) {
        const ma = this.mobs[i];
        const mb = this.mobs[j];
        const a = ma.body.position;
        const b = mb.body.position;
        const minDistance = (ma.type.size.width + mb.type.size.width) / 2;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= minDistance || d === 0 || Math.abs(a.y - b.y) > 2) continue;
        const push = (minDistance - d) / 2;
        const nx = (dx / d) * push;
        const nz = (dz / d) * push;
        if (this.fits(a.x - nx, a.y, a.z - nz, ma.type.size)) {
          a.x -= nx;
          a.z -= nz;
        }
        if (this.fits(b.x + nx, b.y, b.z + nz, mb.type.size)) {
          b.x += nx;
          b.z += nz;
        }
      }
    }
  }

  private fits(x: number, y: number, z: number, size: BodySize): boolean {
    const half = size.width / 2;
    for (let bx = Math.floor(x - half); bx < x + half; bx++) {
      for (let by = Math.floor(y); by < y + size.height; by++) {
        for (let bz = Math.floor(z - half); bz < z + half; bz++) {
          if (this.world.isSolid(bx, by, bz)) return false;
        }
      }
    }
    return true;
  }

  private remove(mob: Mob): void {
    this.scene.remove(mob.model.root);
    mob.model.dispose();
    this.mobs.splice(this.mobs.indexOf(mob), 1);
  }
}
