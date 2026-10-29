import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/world/blocks';
import { Chunk } from '../src/world/Chunk';
import { chunkKey, toChunkCoord, toLocalCoord } from '../src/world/coords';
import { TerrainGenerator } from '../src/world/generation/TerrainGenerator';
import { World } from '../src/world/World';

describe('coordinates', () => {
  it('handles negative world coordinates', () => {
    expect(toChunkCoord(0)).toBe(0);
    expect(toChunkCoord(15.9)).toBe(0);
    expect(toChunkCoord(16)).toBe(1);
    expect(toChunkCoord(-1)).toBe(-1);
    expect(toChunkCoord(-16)).toBe(-1);
    expect(toChunkCoord(-17)).toBe(-2);
    expect(toLocalCoord(-1)).toBe(15);
    expect(toLocalCoord(-16)).toBe(0);
    expect(toLocalCoord(-0.5)).toBe(15);
    expect(toLocalCoord(33)).toBe(1);
  });
});

describe('World', () => {
  it('reads and writes blocks in negative chunks', () => {
    const world = new World();
    world.addChunk(new Chunk(-1, -1));
    expect(world.setBlock(-1, 10, -16, BlockId.STONE)).toBe(true);
    expect(world.getBlock(-1, 10, -16)).toBe(BlockId.STONE);
    expect(world.getChunk(-1, -1)?.get(15, 10, 0)).toBe(BlockId.STONE);
    expect(world.setBlock(5, 10, 5, BlockId.STONE)).toBe(false); // chunk not loaded
  });

  it('marks neighbour chunks dirty when editing a border block', () => {
    const world = new World();
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) world.addChunk(new Chunk(cx, cz));
    world.dirty.clear();
    world.setBlock(0, 10, 0, BlockId.STONE); // corner of chunk (0, 0)
    expect([...world.dirty].sort()).toEqual(
      [chunkKey(0, 0), chunkKey(-1, 0), chunkKey(0, -1), chunkKey(-1, -1)].sort(),
    );
  });

  it('builds a padded volume only when all neighbours are loaded', () => {
    const world = new World();
    world.addChunk(new Chunk(0, 0));
    expect(world.buildPaddedVolume(0, 0)).toBeNull();
  });
});

describe('TerrainGenerator', () => {
  it('is deterministic for a given seed', () => {
    const a = new TerrainGenerator('test').generate(3, -2);
    const b = new TerrainGenerator('test').generate(3, -2);
    const c = new TerrainGenerator('other').generate(3, -2);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.blocks).not.toEqual(c.blocks);
  });
});
