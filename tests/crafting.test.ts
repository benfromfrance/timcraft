import { describe, expect, it } from 'vitest';
import { craft } from '../src/crafting/Crafting';
import { RECIPES } from '../src/crafting/recipes';
import { HOTBAR_SIZE, Inventory, STACK_SIZE } from '../src/player/Inventory';
import { ItemId, itemExists } from '../src/items/items';
import { BlockId } from '../src/world/blocks';

const recipe = (id: string) => {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`missing recipe ${id}`);
  return r;
};

describe('craft', () => {
  it('turns a log into 4 planks', () => {
    const inv = new Inventory();
    inv.add(BlockId.LOG, 2);
    expect(craft(inv, recipe('planks'), false)).toBe('ok');
    expect(inv.count(BlockId.LOG)).toBe(1);
    expect(inv.count(BlockId.PLANKS)).toBe(4);
  });

  it('requires a crafting table for advanced recipes', () => {
    const inv = new Inventory();
    inv.add(BlockId.SAND, 2);
    inv.add(BlockId.PLANKS, 1);
    expect(craft(inv, recipe('glass'), false)).toBe('needs-table');
    expect(craft(inv, recipe('glass'), true)).toBe('ok');
    expect(inv.count(BlockId.GLASS)).toBe(2);
    expect(inv.count(BlockId.SAND)).toBe(0);
    expect(inv.count(BlockId.PLANKS)).toBe(0);
  });

  it('does nothing when ingredients are missing', () => {
    const inv = new Inventory();
    inv.add(BlockId.PLANKS, 3);
    expect(craft(inv, recipe('crafting_table'), false)).toBe('missing');
    expect(inv.count(BlockId.PLANKS)).toBe(3);
  });

  it('rolls back when the result does not fit', () => {
    const inv = new Inventory();
    inv.add(BlockId.LOG, 1);
    // Fill every other slot with full stacks: the log's slot frees up, but 4 planks fit there.
    for (let i = 1; i < HOTBAR_SIZE; i++) inv.slots[i] = { id: BlockId.DIRT, count: STACK_SIZE };
    expect(craft(inv, recipe('planks'), false)).toBe('ok');

    // Now no room at all for crafting a table from planks + a stack of dirt kept around.
    const full = new Inventory();
    full.slots[0] = { id: BlockId.PLANKS, count: STACK_SIZE };
    for (let i = 1; i < HOTBAR_SIZE; i++) full.slots[i] = { id: BlockId.DIRT, count: STACK_SIZE };
    expect(craft(full, recipe('crafting_table'), false)).toBe('full');
    expect(full.count(BlockId.PLANKS)).toBe(STACK_SIZE);
  });
});

describe('weapons', () => {
  it('crafts a stone sword at a table, as a single tool with durability', () => {
    const inv = new Inventory();
    inv.add(BlockId.COBBLESTONE, 4);
    inv.add(ItemId.STICK, 2);
    expect(craft(inv, recipe('stone_sword'), true)).toBe('ok');
    expect(craft(inv, recipe('stone_sword'), true)).toBe('ok');
    const swords = inv.slots.filter((s) => s?.id === ItemId.STONE_SWORD);
    expect(swords).toHaveLength(2); // tools never stack
    expect(swords[0]?.durability).toBeGreaterThan(0);
  });

  it('breaks a tool once its durability is used up', () => {
    const inv = new Inventory();
    inv.add(ItemId.WOODEN_SWORD);
    const slot = inv.slots[0];
    if (!slot) throw new Error('no sword');
    slot.durability = 2;
    expect(inv.wear(0)).toBe(false);
    expect(inv.wear(0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
  });
});

describe('RECIPES', () => {
  it('only references existing blocks and has unique ids', () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    expect(ids.size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      for (const stack of [r.output, ...r.inputs]) {
        expect(itemExists(stack.id)).toBe(true);
        expect(stack.count).toBeGreaterThan(0);
      }
    }
  });
});
