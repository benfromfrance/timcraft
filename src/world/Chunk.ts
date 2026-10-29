export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 256;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

export function blockIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export class Chunk {
  /** Edited by the player since generation: must be kept when unloaded. */
  modified = false;
  /** Bumped on every player edit, so caches derived from the blocks know they are stale. */
  revision = 0;

  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly blocks: Uint8Array = new Uint8Array(CHUNK_VOLUME),
  ) {}

  get(x: number, y: number, z: number): number {
    return this.blocks[blockIndex(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number): void {
    this.blocks[blockIndex(x, y, z)] = id;
  }
}
