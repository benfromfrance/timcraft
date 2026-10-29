import { ItemId } from '../items/items';
import type { ItemStack } from '../player/Inventory';
import { BlockId } from '../world/blocks';

export interface Recipe {
  id: string;
  output: ItemStack;
  inputs: ItemStack[];
  /** Only available from a crafting table; otherwise craftable anywhere (key E). */
  needsTable: boolean;
}

/** Single source of truth for crafting, in display order. */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'planks',
    output: { id: BlockId.PLANKS, count: 4 },
    inputs: [{ id: BlockId.LOG, count: 1 }],
    needsTable: false,
  },
  {
    id: 'crafting_table',
    output: { id: BlockId.CRAFTING_TABLE, count: 1 },
    inputs: [{ id: BlockId.PLANKS, count: 4 }],
    needsTable: false,
  },
  {
    id: 'sticks',
    output: { id: ItemId.STICK, count: 4 },
    inputs: [{ id: BlockId.PLANKS, count: 2 }],
    needsTable: false,
  },
  {
    id: 'wooden_sword',
    output: { id: ItemId.WOODEN_SWORD, count: 1 },
    inputs: [
      { id: BlockId.PLANKS, count: 2 },
      { id: ItemId.STICK, count: 1 },
    ],
    needsTable: true,
  },
  {
    id: 'stone_sword',
    output: { id: ItemId.STONE_SWORD, count: 1 },
    inputs: [
      { id: BlockId.COBBLESTONE, count: 2 },
      { id: ItemId.STICK, count: 1 },
    ],
    needsTable: true,
  },
  {
    id: 'stone_axe',
    output: { id: ItemId.STONE_AXE, count: 1 },
    inputs: [
      { id: BlockId.COBBLESTONE, count: 3 },
      { id: ItemId.STICK, count: 2 },
    ],
    needsTable: true,
  },
  {
    id: 'glass',
    output: { id: BlockId.GLASS, count: 2 },
    inputs: [
      { id: BlockId.SAND, count: 2 },
      { id: BlockId.PLANKS, count: 1 }, // burnt as fuel
    ],
    needsTable: true,
  },
  {
    id: 'bricks',
    output: { id: BlockId.BRICKS, count: 4 },
    inputs: [
      { id: BlockId.DIRT, count: 2 },
      { id: BlockId.SAND, count: 2 },
    ],
    needsTable: true,
  },
  {
    id: 'stone',
    output: { id: BlockId.STONE, count: 1 },
    inputs: [{ id: BlockId.COBBLESTONE, count: 1 }],
    needsTable: true,
  },
  {
    id: 'stone_bricks',
    output: { id: BlockId.STONE_BRICKS, count: 4 },
    inputs: [{ id: BlockId.STONE, count: 4 }],
    needsTable: true,
  },
];
