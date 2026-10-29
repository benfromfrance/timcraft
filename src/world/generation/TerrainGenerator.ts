import alea from 'alea';
import { createNoise2D, createNoise3D, type NoiseFunction2D } from 'simplex-noise';
import { BlockId } from '../blocks';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from '../Chunk';
import type { Blueprint } from './blueprint';
import { CASTLE_FLOOR_SAMPLES, castleLayout } from './castle';
import { FORTRESS_FLOOR_SAMPLES, fortressLayout } from './fortress';

export const SEA_LEVEL = 62;

function fbm(noise: NoiseFunction2D, x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Deterministic hash of a column → [0, 1). */
function hash2(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Same seed ⇒ same world. Pure: runs in workers. */
export class TerrainGenerator {
  private readonly continent: NoiseFunction2D;
  private readonly detail: NoiseFunction2D;
  private readonly cave: ReturnType<typeof createNoise3D>;
  private readonly hashSeed: number;
  /** Floor heights of the castle (north of the spawn point) and of the fortress (east of it). */
  readonly castleFloor: number;
  readonly fortressFloor: number;
  private readonly buildings: { blueprint: Blueprint; floorY: number }[];

  constructor(seed: string) {
    const prng = alea(seed);
    this.continent = createNoise2D(prng);
    this.detail = createNoise2D(prng);
    this.cave = createNoise3D(prng);
    this.hashSeed = Math.floor(prng() * 4294967296);
    const heightAt = (x: number, z: number) => this.heightAt(x, z);
    const castle = castleLayout().blueprint;
    const fortress = fortressLayout().blueprint;
    this.castleFloor = castle.floorY(heightAt, CASTLE_FLOOR_SAMPLES, SEA_LEVEL);
    this.fortressFloor = fortress.floorY(heightAt, FORTRESS_FLOOR_SAMPLES, SEA_LEVEL);
    this.buildings = [
      { blueprint: castle, floorY: this.castleFloor },
      { blueprint: fortress, floorY: this.fortressFloor },
    ];
  }

  heightAt(wx: number, wz: number): number {
    const c = fbm(this.continent, wx / 400, wz / 400, 3);
    const d = fbm(this.detail, wx / 60, wz / 60, 4);
    const mountains = Math.max(0, c) ** 2 * 60;
    const h = Math.floor(SEA_LEVEL + 4 + c * 12 + d * 6 + mountains);
    return Math.min(h, CHUNK_HEIGHT - 12);
  }

  generate(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const h = this.heightAt(wx, wz);
        const beach = h <= SEA_LEVEL + 1;

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === h) id = beach ? BlockId.SAND : BlockId.GRASS;
          else if (y > h - 4) id = beach ? BlockId.SAND : BlockId.DIRT;
          else id = BlockId.STONE;

          // Caves stay below the surface layers so the ground never collapses.
          if (y > 4 && y < h - 5 && this.cave(wx / 22, y / 14, wz / 22) > 0.62) id = BlockId.AIR;
          chunk.set(x, y, z, id);
        }
      }
    }

    this.placeTrees(chunk);
    for (const { blueprint, floorY } of this.buildings) {
      blueprint.stamp(chunk, floorY, (x, z) => this.heightAt(x, z));
    }
    return chunk;
  }

  /** Trees are kept inside the chunk so generation never depends on neighbours. */
  private placeTrees(chunk: Chunk): void {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      for (let x = 2; x < CHUNK_SIZE - 2; x++) {
        const wx = chunk.cx * CHUNK_SIZE + x;
        const wz = chunk.cz * CHUNK_SIZE + z;
        const roll = hash2(this.hashSeed, wx, wz);
        if (roll > 0.012) continue;

        const ground = this.heightAt(wx, wz);
        if (chunk.get(x, ground, z) !== BlockId.GRASS) continue;

        const trunk = 4 + Math.floor((roll / 0.012) * 3);
        const top = ground + trunk;
        if (top + 2 >= CHUNK_HEIGHT) continue;

        chunk.set(x, ground, z, BlockId.DIRT);
        for (let y = ground + 1; y <= top; y++) chunk.set(x, y, z, BlockId.LOG);

        for (let y = top - 2; y <= top + 1; y++) {
          const r = y <= top - 1 ? 2 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              const isCorner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (isCorner && hash2(this.hashSeed + y, wx + dx, wz + dz) < 0.6) continue;
              if (chunk.get(x + dx, y, z + dz) === BlockId.AIR) {
                chunk.set(x + dx, y, z + dz, BlockId.LEAVES);
              }
            }
          }
        }
      }
    }
  }
}
