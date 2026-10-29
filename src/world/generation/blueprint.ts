import { BlockId } from '../blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from '../Chunk';

// Buildings stamped into the terrain (the castles). Heights inside a blueprint are relative to
// its floor: r = y − floorY, r = 0 being the floor blocks.

export interface CastlePos {
  x: number;
  r: number;
  z: number;
}

/** Axis-aligned box of block cells, inclusive. */
export interface CastleZone {
  minX: number;
  maxX: number;
  minR: number;
  maxR: number;
  minZ: number;
  maxZ: number;
}

export const zone = (
  x0: number,
  x1: number,
  r0: number,
  r1: number,
  z0: number,
  z1: number,
): CastleZone => ({
  minX: Math.min(x0, x1),
  maxX: Math.max(x0, x1),
  minR: Math.min(r0, r1),
  maxR: Math.max(r0, r1),
  minZ: Math.min(z0, z1),
  maxZ: Math.max(z0, z1),
});

export function inZone(z: CastleZone, x: number, r: number, wz: number): boolean {
  return x >= z.minX && x <= z.maxX && r >= z.minR && r <= z.maxR && wz >= z.minZ && wz <= z.maxZ;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlueprintBounds extends CastleZone {
  /** Ground kept flat around the walls, then blended back to the natural terrain. */
  flat: number;
  blend: number;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** A building as a block volume over its footprint, built once and stamped into chunks. */
export class Blueprint {
  readonly blocks: Uint8Array;
  private readonly w: number;
  private readonly d: number;

  constructor(readonly bounds: BlueprintBounds) {
    this.w = bounds.maxX - bounds.minX + 1;
    this.d = bounds.maxZ - bounds.minZ + 1;
    this.blocks = new Uint8Array(this.w * this.d * (bounds.maxR - bounds.minR + 1));
  }

  private index(x: number, r: number, z: number): number {
    const b = this.bounds;
    return x - b.minX + (z - b.minZ) * this.w + (r - b.minR) * this.w * this.d;
  }

  contains(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  get(x: number, r: number, z: number): number {
    return this.blocks[this.index(x, r, z)];
  }

  set(x: number, r: number, z: number, id: number): void {
    this.blocks[this.index(x, r, z)] = id;
  }

  fill(z: CastleZone, id: number): void {
    for (let r = z.minR; r <= z.maxR; r++) {
      for (let wz = z.minZ; wz <= z.maxZ; wz++) {
        for (let x = z.minX; x <= z.maxX; x++) this.set(x, r, wz, id);
      }
    }
  }

  box(x0: number, x1: number, r0: number, r1: number, z0: number, z1: number, id: number): void {
    this.fill(zone(x0, x1, r0, r1, z0, z1), id);
  }

  /** Walls of a hollow-free rectangle (r1…r2), without its interior. */
  walls(x0: number, x1: number, r0: number, r1: number, z0: number, z1: number, id: number): void {
    this.box(x0, x1, r0, r1, z0, z0, id);
    this.box(x0, x1, r0, r1, z1, z1, id);
    this.box(x0, x0, r0, r1, z0, z1, id);
    this.box(x1, x1, r0, r1, z0, z1, id);
  }

  /** Floor height for a terrain: the average natural ground at a few points. */
  floorY(
    heightAt: (x: number, z: number) => number,
    samples: readonly [number, number][],
    seaLevel: number,
  ): number {
    const average = samples.reduce((sum, [x, z]) => sum + heightAt(x, z), 0) / samples.length;
    return Math.max(seaLevel + 2, Math.min(CHUNK_HEIGHT - 40, Math.round(average)));
  }

  /**
   * Writes the building into a freshly generated chunk: its own blocks over the footprint, and
   * the ground around it levelled to the floor height, blending back into the natural terrain.
   */
  stamp(chunk: Chunk, floorY: number, heightAt: (x: number, z: number) => number): void {
    const b = this.bounds;
    const margin = b.flat + b.blend;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    if (x0 + CHUNK_SIZE - 1 < b.minX - margin || x0 > b.maxX + margin) return;
    if (z0 + CHUNK_SIZE - 1 < b.minZ - margin || z0 > b.maxZ + margin) return;

    const top = CHUNK_HEIGHT - 1;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const dx = Math.max(b.minX - wx, 0, wx - b.maxX);
        const dz = Math.max(b.minZ - wz, 0, wz - b.maxZ);
        const d = Math.hypot(dx, dz);
        if (d > margin) continue;
        const h = heightAt(wx, wz);

        if (d === 0) {
          for (let y = h + 1; y < floorY + b.minR; y++) chunk.set(lx, y, lz, BlockId.STONE);
          for (let r = b.minR; r <= b.maxR; r++) chunk.set(lx, floorY + r, lz, this.get(wx, r, wz));
          for (let y = floorY + b.maxR + 1; y <= Math.min(top, h + 10); y++)
            chunk.set(lx, y, lz, BlockId.AIR);
          continue;
        }

        const t = smoothstep(Math.min(1, Math.max(0, (d - b.flat) / b.blend)));
        const ground = Math.round(floorY + (h - floorY) * t);
        for (let y = h + 1; y < ground - 3; y++) chunk.set(lx, y, lz, BlockId.STONE);
        for (let y = Math.max(0, ground - 3); y < ground; y++) chunk.set(lx, y, lz, BlockId.DIRT);
        chunk.set(lx, ground, lz, BlockId.GRASS);
        for (let y = ground + 1; y <= Math.min(top, Math.max(h, ground) + 10); y++)
          chunk.set(lx, y, lz, BlockId.AIR);
      }
    }
  }
}
