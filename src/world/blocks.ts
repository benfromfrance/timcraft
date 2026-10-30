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
  CASTLE_STONE: 15,
  // Item sprites (transparent background), see items/items.ts.
  STICK: 16,
  WOODEN_SWORD: 17,
  STONE_SWORD: 18,
  STONE_AXE: 19,
  PORTCULLIS: 20,
  CRACKED_STONE: 21,
  CHEST_SIDE: 22,
  CHEST_TOP: 23,
  GOLD: 24,
  RUNE_SWORD: 25,
  DARK_STONE: 26,
  FLAGSTONE: 27,
  SPIKES: 28,
  SPIKES_TOP: 29,
  PLATE: 30,
  RUNE_AXE: 31,
  CITADEL_STONE: 32,
  GHOST: 33,
  GHOST_SHOWN: 34,
  ARROW_TRAP: 35,
  SPECTRAL_SWORD: 36,
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
  // Castle (see generation/castle.ts).
  CASTLE_STONE: 13,
  CRACKED_STONE: 14,
  PORTCULLIS: 15,
  CHEST: 16,
  GOLD: 17,
  // Fortress (see generation/fortress.ts). FLAGSTONE and CRUMBLE look the same on purpose.
  DARK_STONE: 18,
  FLAGSTONE: 19,
  CRUMBLE: 20,
  SPIKES: 21,
  PLATE: 22,
  // Citadel (see generation/citadel.ts). GHOST is solid but invisible; HIDDEN_PLATE looks like FLAGSTONE.
  CITADEL_STONE: 23,
  GHOST: 24,
  GHOST_SHOWN: 25,
  ARROW_TRAP: 26,
  HIDDEN_PLATE: 27,
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
  /** Colour seen from above on the minimap (0xRRGGBB). */
  mapColor: number;
  /** Cannot be broken in survival (the castle's walls, doors and chests). */
  unbreakable?: boolean;
}

const all = (tile: number) => ({ top: tile, bottom: tile, side: tile });

const DEFS: BlockDef[] = [
  {
    id: BlockId.AIR,
    mapColor: 0x000000,
    name: 'Air',
    solid: false,
    transparent: true,
    tiles: all(0),
  },
  {
    id: BlockId.GRASS,
    mapColor: 0x5f9e3a,
    name: 'Herbe',
    solid: true,
    transparent: false,
    tiles: { top: Tile.GRASS_TOP, bottom: Tile.DIRT, side: Tile.GRASS_SIDE },
    drop: BlockId.DIRT,
  },
  {
    id: BlockId.DIRT,
    mapColor: 0x8a5f3c,
    name: 'Terre',
    solid: true,
    transparent: false,
    tiles: all(Tile.DIRT),
  },
  {
    id: BlockId.STONE,
    mapColor: 0x7d7f80,
    name: 'Pierre',
    solid: true,
    transparent: false,
    tiles: all(Tile.STONE),
    drop: BlockId.COBBLESTONE,
  },
  {
    id: BlockId.SAND,
    mapColor: 0xdccf8f,
    name: 'Sable',
    solid: true,
    transparent: false,
    tiles: all(Tile.SAND),
  },
  {
    id: BlockId.LOG,
    mapColor: 0x6b4d2c,
    name: 'Tronc',
    solid: true,
    transparent: false,
    tiles: { top: Tile.LOG_TOP, bottom: Tile.LOG_TOP, side: Tile.LOG_SIDE },
  },
  {
    id: BlockId.LEAVES,
    mapColor: 0x3b7428,
    name: 'Feuilles',
    solid: true,
    transparent: true,
    tiles: all(Tile.LEAVES),
  },
  {
    id: BlockId.PLANKS,
    mapColor: 0xb08850,
    name: 'Planches',
    solid: true,
    transparent: false,
    tiles: all(Tile.PLANKS),
  },
  {
    id: BlockId.COBBLESTONE,
    mapColor: 0x6c6d6e,
    name: 'Pavé',
    solid: true,
    transparent: false,
    tiles: all(Tile.COBBLESTONE),
  },
  {
    id: BlockId.GLASS,
    mapColor: 0xbfe3ee,
    name: 'Verre',
    solid: true,
    transparent: true,
    tiles: all(Tile.GLASS),
  },
  {
    id: BlockId.BRICKS,
    mapColor: 0xa04a3a,
    name: 'Briques',
    solid: true,
    transparent: false,
    tiles: all(Tile.BRICKS),
  },
  {
    id: BlockId.CRAFTING_TABLE,
    mapColor: 0x9a6a3a,
    name: 'Établi',
    solid: true,
    transparent: false,
    tiles: { top: Tile.CRAFTING_TABLE_TOP, bottom: Tile.PLANKS, side: Tile.CRAFTING_TABLE_SIDE },
  },
  {
    id: BlockId.STONE_BRICKS,
    mapColor: 0x8c8e90,
    name: 'Pierre taillée',
    solid: true,
    transparent: false,
    tiles: all(Tile.STONE_BRICKS),
  },
  {
    id: BlockId.CASTLE_STONE,
    mapColor: 0x5a5f6e,
    name: 'Pierre du château',
    solid: true,
    transparent: false,
    tiles: all(Tile.CASTLE_STONE),
    unbreakable: true,
  },
  {
    id: BlockId.CRACKED_STONE,
    mapColor: 0x585c69,
    name: 'Pierre fissurée',
    solid: true,
    transparent: false,
    tiles: all(Tile.CRACKED_STONE),
    drop: BlockId.COBBLESTONE,
  },
  {
    id: BlockId.PORTCULLIS,
    mapColor: 0x3a3a40,
    name: 'Herse',
    solid: true,
    transparent: true,
    tiles: all(Tile.PORTCULLIS),
    unbreakable: true,
  },
  {
    id: BlockId.CHEST,
    mapColor: 0xb07a30,
    name: 'Coffre',
    solid: true,
    transparent: false,
    tiles: { top: Tile.CHEST_TOP, bottom: Tile.CHEST_TOP, side: Tile.CHEST_SIDE },
    unbreakable: true,
  },
  {
    id: BlockId.GOLD,
    mapColor: 0xe8c040,
    name: 'Bloc d’or',
    solid: true,
    transparent: false,
    tiles: all(Tile.GOLD),
  },
  {
    id: BlockId.DARK_STONE,
    mapColor: 0x3e3a48,
    name: 'Pierre de la forteresse',
    solid: true,
    transparent: false,
    tiles: all(Tile.DARK_STONE),
    unbreakable: true,
  },
  {
    id: BlockId.FLAGSTONE,
    mapColor: 0x6e6a62,
    name: 'Dalle',
    solid: true,
    transparent: false,
    tiles: all(Tile.FLAGSTONE),
    unbreakable: true,
  },
  {
    id: BlockId.CRUMBLE,
    mapColor: 0x6e6a62,
    name: 'Dalle',
    solid: true,
    transparent: false,
    tiles: all(Tile.FLAGSTONE),
    unbreakable: true,
  },
  {
    id: BlockId.SPIKES,
    mapColor: 0x8a8a92,
    name: 'Piques',
    solid: false,
    transparent: true,
    tiles: { top: Tile.SPIKES_TOP, bottom: Tile.SPIKES_TOP, side: Tile.SPIKES },
    unbreakable: true,
  },
  {
    id: BlockId.PLATE,
    mapColor: 0xb49640,
    name: 'Dalle de pression',
    solid: true,
    transparent: false,
    tiles: { top: Tile.PLATE, bottom: Tile.FLAGSTONE, side: Tile.FLAGSTONE },
    unbreakable: true,
  },
  {
    id: BlockId.CITADEL_STONE,
    mapColor: 0xb8b09a,
    name: 'Pierre de la citadelle',
    solid: true,
    transparent: false,
    tiles: all(Tile.CITADEL_STONE),
    unbreakable: true,
  },
  {
    id: BlockId.GHOST,
    mapColor: 0x8a8a92,
    name: 'Dalle invisible',
    solid: true,
    transparent: true,
    tiles: all(Tile.GHOST),
    unbreakable: true,
  },
  {
    id: BlockId.GHOST_SHOWN,
    mapColor: 0x8a8a92,
    name: 'Dalle spectrale',
    solid: true,
    transparent: true,
    tiles: all(Tile.GHOST_SHOWN),
    unbreakable: true,
  },
  {
    id: BlockId.ARROW_TRAP,
    mapColor: 0xb8b09a,
    name: 'Lance-flèches',
    solid: true,
    transparent: false,
    tiles: all(Tile.ARROW_TRAP),
    unbreakable: true,
  },
  {
    id: BlockId.HIDDEN_PLATE,
    mapColor: 0x6e6a62,
    name: 'Dalle',
    solid: true,
    transparent: false,
    tiles: all(Tile.FLAGSTONE),
    unbreakable: true,
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

export function isUnbreakable(id: number): boolean {
  return BLOCKS[id]?.unbreakable === true;
}
