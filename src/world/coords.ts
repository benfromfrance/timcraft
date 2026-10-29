import { CHUNK_SIZE } from './Chunk';

/** World coordinate → chunk coordinate. Correct for negatives (floor, not truncation). */
export function toChunkCoord(w: number): number {
  return Math.floor(w / CHUNK_SIZE);
}

/** World coordinate → local coordinate inside its chunk, always in [0, CHUNK_SIZE). */
export function toLocalCoord(w: number): number {
  const b = Math.floor(w);
  return b - Math.floor(b / CHUNK_SIZE) * CHUNK_SIZE;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}
