import { PLAYER_SIZE, type PlayerState, type Vec3 } from './Player';

export type SolidFn = (x: number, y: number, z: number) => boolean;

export interface BodySize {
  width: number;
  height: number;
}

export interface MoveInput {
  /** -1 (back) … 1 (forward). */
  forward: number;
  /** -1 (left) … 1 (right). */
  strafe: number;
  jump: boolean;
  /** Sprint on foot, descend while flying. */
  shift: boolean;
}

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const TERMINAL_VELOCITY = 50;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.8;
const FLY_SPEED = 11;
const EPSILON = 1e-4;

type Axis = 'x' | 'y' | 'z';

/**
 * Advances a body (the player, or a mob with its own size) by dt with axis-separated AABB
 * collisions against the voxel grid. A `forward` below 1 walks proportionally slower.
 * Returns true when a wall stopped the horizontal movement (mobs use it to jump).
 */
export function stepPlayer(
  p: PlayerState,
  input: MoveInput,
  dt: number,
  isSolid: SolidFn,
  size: BodySize = PLAYER_SIZE,
): boolean {
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  let wishX = -sin * input.forward + cos * input.strafe;
  let wishZ = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(wishX, wishZ);
  if (len > 1) {
    wishX /= len;
    wishZ /= len;
  }

  const v = p.velocity;
  const speed = p.flying ? FLY_SPEED : input.shift ? SPRINT_SPEED : WALK_SPEED;
  // Exponential smoothing toward the target speed; less control in the air.
  const control = 1 - Math.exp(-(p.onGround || p.flying ? 20 : 4) * dt);
  v.x += (wishX * speed - v.x) * control;
  v.z += (wishZ * speed - v.z) * control;

  if (p.flying) {
    v.y = ((input.jump ? 1 : 0) - (input.shift ? 1 : 0)) * FLY_SPEED;
  } else {
    if (input.jump && p.onGround) v.y = JUMP_VELOCITY;
    v.y = Math.max(v.y - GRAVITY * dt, -TERMINAL_VELOCITY);
  }

  const hitX = moveAxis(p, 'x', v.x * dt, isSolid, size);
  const wasFalling = v.y < 0;
  const hitY = moveAxis(p, 'y', v.y * dt, isSolid, size);
  const hitZ = moveAxis(p, 'z', v.z * dt, isSolid, size);
  p.onGround = hitY && wasFalling;
  return hitX || hitZ;
}

/** Moves along one axis; on collision snaps against the blocking face and zeroes that velocity. */
function moveAxis(
  p: PlayerState,
  axis: Axis,
  delta: number,
  isSolid: SolidFn,
  size: BodySize,
): boolean {
  if (delta === 0) return false;
  const pos = p.position;
  pos[axis] += delta;

  const half = size.width / 2;
  const min: Vec3 = { x: pos.x - half, y: pos.y, z: pos.z - half };
  const max: Vec3 = { x: pos.x + half, y: pos.y + size.height, z: pos.z + half };

  let hit = false;
  let limit = delta > 0 ? Infinity : -Infinity;
  for (let bx = Math.floor(min.x); bx < max.x; bx++) {
    for (let by = Math.floor(min.y); by < max.y; by++) {
      for (let bz = Math.floor(min.z); bz < max.z; bz++) {
        if (!isSolid(bx, by, bz)) continue;
        hit = true;
        const b = axis === 'x' ? bx : axis === 'y' ? by : bz;
        limit = delta > 0 ? Math.min(limit, b) : Math.max(limit, b + 1);
      }
    }
  }
  if (!hit) return false;

  const extentBelow = axis === 'y' ? 0 : half;
  const extentAbove = axis === 'y' ? size.height : half;
  pos[axis] = delta > 0 ? limit - extentAbove - EPSILON : limit + extentBelow + EPSILON;
  p.velocity[axis] = 0;
  return true;
}
