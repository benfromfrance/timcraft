import { describe, expect, it } from 'vitest';
import { HOTBAR_SIZE, Inventory, STACK_SIZE } from '../src/player/Inventory';
import { BlockId, dropOf } from '../src/world/blocks';

describe('Inventory', () => {
  it('stacks identical blocks in the same slot', () => {
    const inv = new Inventory();
    inv.add(BlockId.DIRT);
    inv.add(BlockId.STONE);
    inv.add(BlockId.DIRT);
    expect(inv.slots[0]).toEqual({ id: BlockId.DIRT, count: 2 });
    expect(inv.slots[1]).toEqual({ id: BlockId.STONE, count: 1 });
  });

  it('starts a new stack once one is full', () => {
    const inv = new Inventory();
    expect(inv.add(BlockId.DIRT, STACK_SIZE + 3)).toBe(0);
    expect(inv.slots[0]?.count).toBe(STACK_SIZE);
    expect(inv.slots[1]).toEqual({ id: BlockId.DIRT, count: 3 });
  });

  it('returns what does not fit when full', () => {
    const inv = new Inventory();
    inv.add(BlockId.STONE, STACK_SIZE * HOTBAR_SIZE);
    expect(inv.add(BlockId.STONE, 2)).toBe(2);
    expect(inv.add(BlockId.DIRT)).toBe(1);
  });

  it('empties a slot when its last item is used', () => {
    const inv = new Inventory();
    inv.add(BlockId.SAND, 2);
    expect(inv.takeOne(0)).toBe(true);
    expect(inv.slots[0]?.count).toBe(1);
    expect(inv.takeOne(0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.takeOne(0)).toBe(false);
  });
});

describe('dropOf', () => {
  it('converts some blocks when collected', () => {
    expect(dropOf(BlockId.GRASS)).toBe(BlockId.DIRT);
    expect(dropOf(BlockId.STONE)).toBe(BlockId.COBBLESTONE);
    expect(dropOf(BlockId.LOG)).toBe(BlockId.LOG);
  });
});
