import type { Vec3 } from './Player';

export interface RayHit {
  /** Hit block cell. */
  x: number;
  y: number;
  z: number;
  /** Normal of the face that was hit: hit + normal is where a new block goes. */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

/** Voxel traversal (Amanatides & Woo). `dir` must be normalised. */
export function raycast(
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
  isTarget: (x: number, y: number, z: number) => boolean,
): RayHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);
  const tDeltaX = stepX ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dir.z) : Infinity;
  const firstBoundary = (o: number, cell: number, step: number, d: number) =>
    step > 0 ? (cell + 1 - o) / d : step < 0 ? (o - cell) / -d : Infinity;
  let tMaxX = firstBoundary(origin.x, x, stepX, dir.x);
  let tMaxY = firstBoundary(origin.y, y, stepY, dir.y);
  let tMaxZ = firstBoundary(origin.z, z, stepZ, dir.z);

  let nx: number;
  let ny: number;
  let nz: number;
  let t: number;
  for (;;) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      [nx, ny, nz] = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      [nx, ny, nz] = [0, -stepY, 0];
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      [nx, ny, nz] = [0, 0, -stepZ];
    }
    if (t > maxDistance) return null;
    if (isTarget(x, y, z)) return { x, y, z, nx, ny, nz, distance: t };
  }
}

/** Distance along the ray to an axis-aligned box (slab method), or null if missed or too far. */
export function rayBox(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3, maxDistance: number): number | null {
  let tNear = 0;
  let tFar = maxDistance;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - o) / d;
    let t2 = (max[axis] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tNear = Math.max(tNear, t1);
    tFar = Math.min(tFar, t2);
    if (tNear > tFar) return null;
  }
  return tNear;
}
