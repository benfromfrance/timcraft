import { ATLAS_COLS, ATLAS_ROWS, BLOCKS, BlockId, TILE_SIZE, TRANSPARENT } from '../blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../Chunk';

/** Width of the padded volume: the chunk plus one block of each neighbour on every side. */
export const PAD = CHUNK_SIZE + 2;

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

interface Face {
  dir: [number, number, number];
  /** Corners in counter-clockwise order seen from outside: BL, BR, TR, TL. */
  corners: [number, number, number][];
  /** Fixed directional shading so faces are distinguishable without lights. */
  shade: number;
  tile: 'top' | 'bottom' | 'side';
}

const FACES: Face[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8, tile: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8, tile: 'side' },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, tile: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, tile: 'bottom' },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.65, tile: 'side' },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.65, tile: 'side' },
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** Brightness per ambient-occlusion level (0 = fully occluded corner). */
const AO_LEVELS = [0.5, 0.68, 0.84, 1];
/** Half-texel inset so nearest sampling never bleeds into the neighbouring tile. */
const UV_INSET = 0.5 / (ATLAS_COLS * TILE_SIZE);

/** x, z in [-1, CHUNK_SIZE]; y in [0, CHUNK_HEIGHT). */
export function paddedIndex(x: number, y: number, z: number): number {
  return x + 1 + (z + 1) * PAD + y * PAD * PAD;
}

/**
 * Builds the visible faces of a chunk with per-vertex ambient occlusion (face culling).
 * Positions are chunk-local. Pure function: runs in a worker.
 */
export function buildChunkMesh(padded: Uint8Array): MeshData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const sample = (x: number, y: number, z: number): number => {
    if (y >= CHUNK_HEIGHT) return BlockId.AIR;
    if (y < 0) return BlockId.STONE; // never draw the bottom of the world
    return padded[paddedIndex(x, y, z)];
  };
  const occludes = (x: number, y: number, z: number): number =>
    TRANSPARENT[sample(x, y, z)] ? 0 : 1;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = padded[paddedIndex(x, y, z)];
        if (id === BlockId.AIR) continue;
        const def = BLOCKS[id];

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          const neighbor = sample(nx, ny, nz);
          if (!TRANSPARENT[neighbor] || neighbor === id) continue;

          const tile = def.tiles[face.tile];
          const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
          const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
          const base = positions.length / 3;
          const ao: number[] = [];

          for (let i = 0; i < 4; i++) {
            const c = face.corners[i];
            positions.push(x + c[0], y + c[1], z + c[2]);
            const [cu, cv] = CORNER_UV[i];
            uvs.push(
              u0 + (cu ? 1 / ATLAS_COLS - UV_INSET : UV_INSET),
              v0 + (cv ? 1 / ATLAS_ROWS - UV_INSET : UV_INSET),
            );

            // AO: look at the 3 blocks around this corner in the layer in front of the face.
            const o = [c[0] ? 1 : -1, c[1] ? 1 : -1, c[2] ? 1 : -1];
            const t1 = face.dir[0] !== 0 ? 1 : 0; // first tangent axis
            const t2 = face.dir[2] !== 0 ? 1 : 2; // second tangent axis
            const a = [0, 0, 0];
            const b = [0, 0, 0];
            a[t1] = o[t1];
            b[t2] = o[t2];
            const side1 = occludes(nx + a[0], ny + a[1], nz + a[2]);
            const side2 = occludes(nx + b[0], ny + b[1], nz + b[2]);
            const corner = occludes(nx + a[0] + b[0], ny + a[1] + b[1], nz + a[2] + b[2]);
            const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
            ao.push(level);
            const light = AO_LEVELS[level] * face.shade;
            colors.push(light, light, light);
          }

          // Flip the quad diagonal to avoid anisotropic AO artefacts.
          if (ao[0] + ao[2] > ao[1] + ao[3]) {
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          } else {
            indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
