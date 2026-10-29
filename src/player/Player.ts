export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const PLAYER_SIZE = {
  width: 0.6,
  height: 1.8,
  eyeHeight: 1.62,
};

export interface PlayerState {
  /** Feet position (bottom centre of the bounding box). */
  position: Vec3;
  velocity: Vec3;
  /** Radians; yaw 0 looks toward -Z. */
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
}

export function createPlayer(): PlayerState {
  return {
    position: { x: 0.5, y: 100, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: false,
    flying: false,
  };
}

/** True if the block cell at (bx, by, bz) overlaps the player's bounding box. */
export function playerIntersectsBlock(p: PlayerState, bx: number, by: number, bz: number): boolean {
  const half = PLAYER_SIZE.width / 2;
  const { x, y, z } = p.position;
  return (
    x + half > bx && x - half < bx + 1 &&
    y + PLAYER_SIZE.height > by && y < by + 1 &&
    z + half > bz && z - half < bz + 1
  );
}
