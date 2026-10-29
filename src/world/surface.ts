import { BlockId } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, type Chunk } from './Chunk';

/** Top-most non-air block of each column, indexed `x + z * 16`. Empty columns are AIR at 0. */
export interface ChunkSurface {
  ids: Uint8Array;
  heights: Uint8Array;
}

export function chunkSurface(chunk: Chunk): ChunkSurface {
  const columns = CHUNK_SIZE * CHUNK_SIZE;
  const ids = new Uint8Array(columns);
  const heights = new Uint8Array(columns);
  const blocks = chunk.blocks;
  for (let i = 0; i < columns; i++) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = blocks[i + y * columns];
      if (id === BlockId.AIR) continue;
      ids[i] = id;
      heights[i] = y;
      break;
    }
  }
  return { ids, heights };
}
