import type { ChunkRenderer } from '../render/ChunkRenderer';
import type { WorkerPool } from '../workers/WorkerPool';
import { Chunk } from './Chunk';
import { chunkKey, toChunkCoord } from './coords';
import type { World } from './World';

/**
 * Loads chunks around the player (generation + meshing in workers) and unloads far ones.
 * Distances are in chunks (Chebyshev); work is dispatched closest-first.
 */
export class ChunkStreamer {
  private readonly generating = new Set<string>();
  private readonly meshing = new Set<string>();
  /** Player-edited chunks that were unloaded; restored instead of regenerated. */
  private readonly unloadedEdits = new Map<string, Uint8Array>();
  /** Offsets within the generation radius, sorted by distance. */
  private readonly offsets: [number, number][] = [];
  private centerX = 0;
  private centerZ = 0;

  constructor(
    private readonly world: World,
    private readonly pool: WorkerPool,
    private readonly renderer: ChunkRenderer,
    private readonly seed: string,
    readonly renderDistance: number,
  ) {
    const r = renderDistance + 1; // one extra ring so border chunks can be meshed
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) this.offsets.push([dx, dz]);
    this.offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
  }

  update(px: number, pz: number): void {
    this.centerX = toChunkCoord(px);
    this.centerZ = toChunkCoord(pz);
    this.unloadFarChunks();
    this.requestGeneration();
    this.requestMeshing();
  }

  private distance(cx: number, cz: number): number {
    return Math.max(Math.abs(cx - this.centerX), Math.abs(cz - this.centerZ));
  }

  private unloadFarChunks(): void {
    for (const chunk of this.world.chunks.values()) {
      if (this.distance(chunk.cx, chunk.cz) <= this.renderDistance + 2) continue;
      if (chunk.modified) this.unloadedEdits.set(chunkKey(chunk.cx, chunk.cz), chunk.blocks);
      this.world.removeChunk(chunk.cx, chunk.cz);
      this.renderer.remove(chunk.cx, chunk.cz);
    }
  }

  private requestGeneration(): void {
    const limit = this.pool.size * 2;
    for (const [dx, dz] of this.offsets) {
      if (this.generating.size >= limit) return;
      const cx = this.centerX + dx;
      const cz = this.centerZ + dz;
      const key = chunkKey(cx, cz);
      if (this.world.chunks.has(key) || this.generating.has(key)) continue;

      const edited = this.unloadedEdits.get(key);
      if (edited) {
        this.unloadedEdits.delete(key);
        const chunk = new Chunk(cx, cz, edited);
        chunk.modified = true;
        this.world.addChunk(chunk);
        continue;
      }

      this.generating.add(key);
      void this.pool.generate(this.seed, cx, cz).then((blocks) => {
        this.generating.delete(key);
        // The player may have moved away while the worker was busy.
        if (this.distance(cx, cz) > this.renderDistance + 2) return;
        this.world.addChunk(new Chunk(cx, cz, blocks));
      });
    }
  }

  private requestMeshing(): void {
    const candidates: Chunk[] = [];
    for (const key of this.world.dirty) {
      if (this.meshing.has(key)) continue; // remeshed once the in-flight job returns
      const chunk = this.world.chunks.get(key);
      if (chunk && this.distance(chunk.cx, chunk.cz) <= this.renderDistance) candidates.push(chunk);
    }
    candidates.sort((a, b) => this.distance(a.cx, a.cz) - this.distance(b.cx, b.cz));

    const limit = this.pool.size * 2;
    for (const chunk of candidates) {
      if (this.meshing.size >= limit) return;
      const padded = this.world.buildPaddedVolume(chunk.cx, chunk.cz);
      if (!padded) continue;

      const key = chunkKey(chunk.cx, chunk.cz);
      this.world.dirty.delete(key);
      this.meshing.add(key);
      void this.pool.mesh(padded).then((mesh) => {
        this.meshing.delete(key);
        if (this.world.chunks.get(key) === chunk) this.renderer.setMesh(chunk.cx, chunk.cz, mesh);
      });
    }
  }
}
