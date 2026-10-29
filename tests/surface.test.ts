import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/Chunk';
import { chunkSurface } from '../src/world/surface';
import { World } from '../src/world/World';

describe('chunkSurface', () => {
  it('finds the top-most block of each column', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(3, 10, 5, BlockId.STONE);
    chunk.set(3, 64, 5, BlockId.GRASS);
    chunk.set(15, 0, 15, BlockId.SAND);
    const { ids, heights } = chunkSurface(chunk);
    expect(ids[3 + 5 * 16]).toBe(BlockId.GRASS);
    expect(heights[3 + 5 * 16]).toBe(64);
    expect(ids[15 + 15 * 16]).toBe(BlockId.SAND);
    expect(ids[0]).toBe(BlockId.AIR);
  });

  it('every block has a map colour', () => {
    for (const def of BLOCKS) expect(def.mapColor).toBeGreaterThanOrEqual(0);
  });
});

describe('chunk revision', () => {
  it('is bumped by player edits so derived caches refresh', () => {
    const world = new World();
    const chunk = new Chunk(-1, 0);
    world.addChunk(chunk);
    world.setBlock(-3, 70, 2, BlockId.PLANKS);
    expect(chunk.revision).toBe(1);
  });
});
