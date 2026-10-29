import { BLOCKS, blockName, Tile } from '../world/blocks';

// Item ids: 0–255 are blocks (same ids as BlockId, placeable); 256+ are items (tools, materials).
export const FIRST_ITEM_ID = 256;

export const ItemId = {
  STICK: 256,
  WOODEN_SWORD: 257,
  STONE_SWORD: 258,
  STONE_AXE: 259,
} as const;

export interface WeaponStats {
  damage: number;
  /** Minimum time between two hits, in seconds. */
  cooldown: number;
}

export interface ItemDef {
  id: number;
  name: string;
  tile: number;
  maxStack: number;
  /** Number of hits before the tool breaks. */
  durability?: number;
  weapon?: WeaponStats;
}

const DEFS: ItemDef[] = [
  { id: ItemId.STICK, name: 'Bâton', tile: Tile.STICK, maxStack: 64 },
  {
    id: ItemId.WOODEN_SWORD,
    name: 'Épée en bois',
    tile: Tile.WOODEN_SWORD,
    maxStack: 1,
    durability: 60,
    weapon: { damage: 4, cooldown: 0.5 },
  },
  {
    id: ItemId.STONE_SWORD,
    name: 'Épée en pierre',
    tile: Tile.STONE_SWORD,
    maxStack: 1,
    durability: 130,
    weapon: { damage: 6, cooldown: 0.55 },
  },
  {
    id: ItemId.STONE_AXE,
    name: 'Hache en pierre',
    tile: Tile.STONE_AXE,
    maxStack: 1,
    durability: 130,
    weapon: { damage: 9, cooldown: 0.95 },
  },
];

const ITEMS = new Map(DEFS.map((def) => [def.id, def]));

export const BARE_HAND: WeaponStats = { damage: 1, cooldown: 0.3 };
const BLOCK_STACK = 64;

export function isBlockItem(id: number): boolean {
  return id < FIRST_ITEM_ID;
}

export function itemExists(id: number): boolean {
  return isBlockItem(id) ? BLOCKS[id] !== undefined : ITEMS.has(id);
}

export function itemName(id: number): string {
  return isBlockItem(id) ? blockName(id) : (ITEMS.get(id)?.name ?? 'Inconnu');
}

/** Atlas tile used for icons and the held item. */
export function itemTile(id: number): number {
  return isBlockItem(id) ? BLOCKS[id].tiles.side : (ITEMS.get(id)?.tile ?? 0);
}

export function maxStackOf(id: number): number {
  return isBlockItem(id) ? BLOCK_STACK : (ITEMS.get(id)?.maxStack ?? 1);
}

export function maxDurabilityOf(id: number): number | undefined {
  return ITEMS.get(id)?.durability;
}

export function weaponOf(id: number | null): WeaponStats {
  return (id !== null && ITEMS.get(id)?.weapon) || BARE_HAND;
}
