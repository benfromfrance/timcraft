import { BlockId, SOLID } from './blocks';
import { Chunk, CHUNK_HEIGHT, CHUNK_SIZE } from './Chunk';
import { chunkKey, toChunkCoord, toLocalCoord } from './coords';
import { PAD } from './meshing/mesher';

/** Loaded chunks and block access in world coordinates. Independent of rendering. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  /** Keys of chunks whose mesh is out of date. */
  readonly dirty = new Set<string>();

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
    // Neighbours' border faces and ambient occlusion depend on this chunk.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) this.markDirty(chunk.cx + dx, chunk.cz + dz);
    }
  }

  removeChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    this.chunks.delete(key);
    this.dirty.delete(key);
  }

  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockId.AIR;
    const chunk = this.getChunk(toChunkCoord(wx), toChunkCoord(wz));
    if (!chunk) return BlockId.AIR;
    return chunk.get(toLocalCoord(wx), Math.floor(wy), toLocalCoord(wz));
  }

  isSolid(wx: number, wy: number, wz: number): boolean {
    return SOLID[this.getBlock(wx, wy, wz)] === 1;
  }

  /** Returns false if the target chunk is not loaded or the position is out of bounds. */
  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const cx = toChunkCoord(wx);
    const cz = toChunkCoord(wz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;

    const lx = toLocalCoord(wx);
    const lz = toLocalCoord(wz);
    chunk.set(lx, Math.floor(wy), lz, id);
    chunk.modified = true;

    // Remesh this chunk, plus neighbours touching the edited block (diagonals included for AO).
    const dxs = lx === 0 ? [0, -1] : lx === CHUNK_SIZE - 1 ? [0, 1] : [0];
    const dzs = lz === 0 ? [0, -1] : lz === CHUNK_SIZE - 1 ? [0, 1] : [0];
    for (const dx of dxs) for (const dz of dzs) this.markDirty(cx + dx, cz + dz);
    return true;
  }

  /**
   * Copies a chunk plus a 1-block border from its 8 neighbours, as expected by the mesher.
   * Returns null while a neighbour is missing (its border would be meshed wrong).
   */
  buildPaddedVolume(cx: number, cz: number): Uint8Array | null {
    const grid: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (!c) return null;
        grid.push(c);
      }
    }

    const out = new Uint8Array(PAD * PAD * CHUNK_HEIGHT);
    const layer = CHUNK_SIZE * CHUNK_SIZE;
    for (let pz = 0; pz < PAD; pz++) {
      const z = pz - 1;
      const gz = z < 0 ? 0 : z >= CHUNK_SIZE ? 2 : 1;
      const lz = z - (gz - 1) * CHUNK_SIZE;
      for (let px = 0; px < PAD; px++) {
        const x = px - 1;
        const gx = x < 0 ? 0 : x >= CHUNK_SIZE ? 2 : 1;
        const lx = x - (gx - 1) * CHUNK_SIZE;
        const src = grid[gx + gz * 3].blocks;
        let s = lx + lz * CHUNK_SIZE;
        let d = px + pz * PAD;
        for (let y = 0; y < CHUNK_HEIGHT; y++, s += layer, d += PAD * PAD) out[d] = src[s];
      }
    }
    return out;
  }

  private markDirty(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) this.dirty.add(key);
  }
}
