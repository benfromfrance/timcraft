import type { MoveInput } from '../player/Physics';
import type { PlayerState, Vec3 } from '../player/Player';

export interface Behavior {
  chaseRange: number;
  /** Fractions of the walking speed (the player can outrun most mobs by sprinting). */
  chaseSpeed: number;
  wanderSpeed: number;
  /** Stops this close to its target instead of walking into it. */
  stopDistance: number;
}

export const DEFAULT_BEHAVIOR: Behavior = {
  chaseRange: 16,
  chaseSpeed: 0.75,
  wanderSpeed: 0.3,
  stopDistance: 0.9,
};

export interface MobBrain {
  wanderTimer: number;
  wanderYaw: number;
  wandering: boolean;
}

export function createBrain(): MobBrain {
  return { wanderTimer: 0, wanderYaw: 0, wandering: false };
}

/** Rotates `from` toward `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}

/**
 * Decides where a mob walks this tick: straight at `target` when close enough (no
 * pathfinding, it hops over 1-block steps), otherwise random wandering. Updates the yaw.
 */
export function think(
  body: PlayerState,
  brain: MobBrain,
  target: Vec3 | null,
  blocked: boolean,
  dt: number,
  rand: () => number,
  behavior: Behavior = DEFAULT_BEHAVIOR,
): MoveInput {
  const move: MoveInput = { forward: 0, strafe: 0, jump: false, shift: false };

  if (target) {
    const dx = target.x - body.position.x;
    const dz = target.z - body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < behavior.chaseRange) {
      // yaw 0 faces -Z, so facing (dx, dz) means yaw = atan2(-dx, -dz).
      body.yaw = turnToward(body.yaw, Math.atan2(-dx, -dz), dt * 8);
      move.forward = distance > behavior.stopDistance ? behavior.chaseSpeed : 0;
      move.jump = blocked && body.onGround;
      return move;
    }
  }

  brain.wanderTimer -= dt;
  if (brain.wanderTimer <= 0) {
    brain.wanderTimer = 2 + rand() * 3;
    brain.wandering = rand() < 0.6;
    brain.wanderYaw = rand() * Math.PI * 2;
  }
  body.yaw = turnToward(body.yaw, brain.wanderYaw, dt * 3);
  move.forward = brain.wandering ? behavior.wanderSpeed : 0;
  move.jump = brain.wandering && blocked && body.onGround;
  return move;
}
