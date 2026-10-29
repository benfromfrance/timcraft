// Single source of truth for block types. Pure data: safe to import from workers.

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;

/** Tile indices in the texture atlas (row-major, from top-left). */
export const Tile = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG_SIDE: 5,
  LOG_TOP: 6,
  LEAVES: 7,
  PLANKS: 8,
  COBBLESTONE: 9,
  GLASS: 10,
  BRICKS: 11,
  CRAFTING_TABLE_TOP: 12,
  CRAFTING_TABLE_SIDE: 13,
  STONE_BRICKS: 14,
  // Item sprites (transparent background), see items/items.ts.
  STICK: 16,
  WOODEN_SWORD: 17,
  STONE_SWORD: 18,
  STONE_AXE: 19,
} as const;

export const BlockId = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  PLANKS: 7,
  COBBLESTONE: 8,
  GLASS: 9,
  BRICKS: 10,
  CRAFTING_TABLE: 11,
  STONE_BRICKS: 12,
} as const;
export type BlockId = (typeof BlockId)[keyof typeof BlockId];

export interface BlockDef {
  id: BlockId;
  /** Display name shown to the player. */
  name: string;
  /** Collides with the player and can be targeted. */
  solid: boolean;
  /** Lets light/sight through: neighbours keep their faces, no ambient occlusion. */
  transparent: boolean;
  tiles: { top: number; bottom: number; side: number };
  /** Item collected when broken in survival; defaults to the block itself, AIR drops nothing. */
  drop?: BlockId;
}

const all = (tile: number) => ({ top: tile, bottom: tile, side: tile });

const DEFS: BlockDef[] = [
  { id: BlockId.AIR, name: 'Air', solid: false, transparent: true, tiles: all(0) },
  {
    id: BlockId.GRASS,
    name: 'Herbe',
    solid: true,
    transparent: false,
    tiles: { top: Tile.GRASS_TOP, bottom: Tile.DIRT, side: Tile.GRASS_SIDE },
    drop: BlockId.DIRT,
  },
  { id: BlockId.DIRT, name: 'Terre', solid: true, transparent: false, tiles: all(Tile.DIRT) },
  {
    id: BlockId.STONE,
    name: 'Pierre',
    solid: true,
    transparent: false,
    tiles: all(Tile.STONE),
    drop: BlockId.COBBLESTONE,
  },
  { id: BlockId.SAND, name: 'Sable', solid: true, transparent: false, tiles: all(Tile.SAND) },
  {
    id: BlockId.LOG,
    name: 'Tronc',
    solid: true,
    transparent: false,
    tiles: { top: Tile.LOG_TOP, bottom: Tile.LOG_TOP, side: Tile.LOG_SIDE },
  },
  { id: BlockId.LEAVES, name: 'Feuilles', solid: true, transparent: true, tiles: all(Tile.LEAVES) },
  { id: BlockId.PLANKS, name: 'Planches', solid: true, transparent: false, tiles: all(Tile.PLANKS) },
  {
    id: BlockId.COBBLESTONE,
    name: 'Pavé',
    solid: true,
    transparent: false,
    tiles: all(Tile.COBBLESTONE),
  },
  { id: BlockId.GLASS, name: 'Verre', solid: true, transparent: true, tiles: all(Tile.GLASS) },
  { id: BlockId.BRICKS, name: 'Briques', solid: true, transparent: false, tiles: all(Tile.BRICKS) },
  {
    id: BlockId.CRAFTING_TABLE,
    name: 'Établi',
    solid: true,
    transparent: false,
    tiles: { top: Tile.CRAFTING_TABLE_TOP, bottom: Tile.PLANKS, side: Tile.CRAFTING_TABLE_SIDE },
  },
  {
    id: BlockId.STONE_BRICKS,
    name: 'Pierre taillée',
    solid: true,
    transparent: false,
    tiles: all(Tile.STONE_BRICKS),
  },
];

export const BLOCKS: readonly BlockDef[] = DEFS;

// Flat lookup tables for hot loops (meshing, physics).
export const SOLID = new Uint8Array(256);
export const TRANSPARENT = new Uint8Array(256).fill(1);
for (const def of DEFS) {
  SOLID[def.id] = def.solid ? 1 : 0;
  TRANSPARENT[def.id] = def.transparent ? 1 : 0;
}

export function dropOf(id: number): number {
  return BLOCKS[id]?.drop ?? id;
}

export function blockName(id: number): string {
  return BLOCKS[id]?.name ?? 'Inconnu';
}
