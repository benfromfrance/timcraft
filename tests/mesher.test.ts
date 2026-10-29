import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/world/blocks';
import { CHUNK_HEIGHT } from '../src/world/Chunk';
import { buildChunkMesh, PAD, paddedIndex } from '../src/world/meshing/mesher';

const faceCount = (padded: Uint8Array) => buildChunkMesh(padded).indices.length / 6;
const empty = () => new Uint8Array(PAD * PAD * CHUNK_HEIGHT);

describe('buildChunkMesh', () => {
  it('draws 6 faces for an isolated block', () => {
    const v = empty();
    v[paddedIndex(5, 10, 5)] = BlockId.STONE;
    const mesh = buildChunkMesh(v);
    expect(mesh.indices.length).toBe(36);
    expect(mesh.positions.length).toBe(6 * 4 * 3);
  });

  it('culls the shared face between two opaque blocks', () => {
    const v = empty();
    v[paddedIndex(5, 10, 5)] = BlockId.STONE;
    v[paddedIndex(6, 10, 5)] = BlockId.STONE;
    expect(faceCount(v)).toBe(10);
  });

  it('keeps opaque faces behind glass but hides glass faces against opaque blocks', () => {
    const v = empty();
    v[paddedIndex(5, 10, 5)] = BlockId.STONE;
    v[paddedIndex(6, 10, 5)] = BlockId.GLASS;
    expect(faceCount(v)).toBe(11);
  });

  it('culls faces against blocks from neighbouring chunks in the padding', () => {
    const v = empty();
    v[paddedIndex(15, 10, 5)] = BlockId.STONE;
    v[paddedIndex(16, 10, 5)] = BlockId.STONE; // belongs to the +X neighbour
    expect(faceCount(v)).toBe(5);
  });
});
