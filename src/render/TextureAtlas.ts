import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, Tile, TILE_SIZE } from '../world/blocks';

// Original textures, painted procedurally at startup: no image assets to ship.

type RGBA = [number, number, number, number];
type Painter = (x: number, y: number) => RGBA;
type PainterFactory = (rand: () => number) => Painter;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function vary(rand: () => number, rgb: [number, number, number], amount: number, k = 1): RGBA {
  const f = (1 + (rand() - 0.5) * amount) * k;
  return [clamp(rgb[0] * f), clamp(rgb[1] * f), clamp(rgb[2] * f), 255];
}

const CLEAR: RGBA = [0, 0, 0, 0];
const opaque = (rgb: [number, number, number]): RGBA => [rgb[0], rgb[1], rgb[2], 255];

/**
 * Tool sprites are drawn along the bottom-left → top-right diagonal:
 * `a` runs along it (handle < 0 < tip), `p` is the perpendicular offset.
 */
const diagonal = (x: number, y: number) => ({ a: x - y, p: x + y - (TILE_SIZE - 1) });

const HANDLE: [number, number, number] = [124, 88, 50];
const HANDLE_DARK: [number, number, number] = [84, 58, 32];

function handle(a: number, p: number, from: number, to: number): RGBA | null {
  if (a < from || a > to || (p !== 0 && p !== 1)) return null;
  return opaque(p === 0 ? HANDLE : HANDLE_DARK);
}

function swordPainter(
  edge: [number, number, number],
  core: [number, number, number],
): PainterFactory {
  return () => (x, y) => {
    const { a, p } = diagonal(x, y);
    if (a >= -1 && a <= 13 && Math.abs(p) <= 1) return opaque(p === 0 ? core : edge);
    if (a >= -3 && a <= -2 && Math.abs(p) <= 4) return opaque([70, 62, 54]); // guard
    if (a >= -12 && a <= -11 && Math.abs(p) <= 1) return opaque(HANDLE_DARK); // pommel
    return handle(a, p, -10, -4) ?? CLEAR;
  };
}

const GRASS: [number, number, number] = [96, 160, 56];
const DIRT: [number, number, number] = [134, 96, 67];

const PAINTERS: Record<number, PainterFactory> = {
  [Tile.GRASS_TOP]: (rand) => () => vary(rand, GRASS, 0.3),
  [Tile.DIRT]: (rand) => () => vary(rand, DIRT, 0.3),
  [Tile.GRASS_SIDE]: (rand) => {
    const depth = Array.from({ length: TILE_SIZE }, () => 3 + Math.floor(rand() * 3));
    return (x, y) => (y < depth[x] ? vary(rand, GRASS, 0.3, 0.9) : vary(rand, DIRT, 0.3));
  },
  [Tile.STONE]: (rand) => () => vary(rand, [126, 126, 128], 0.18, rand() < 0.1 ? 0.75 : 1),
  [Tile.SAND]: (rand) => () => vary(rand, [220, 206, 160], 0.12),
  [Tile.LOG_SIDE]: (rand) => (x) => vary(rand, [104, 80, 48], 0.2, x % 4 === 0 ? 0.75 : 1),
  [Tile.LOG_TOP]: (rand) => (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return vary(rand, [104, 80, 48], 0.2);
    return vary(rand, Math.floor(d) % 2 ? [182, 146, 92] : [160, 126, 76], 0.08);
  },
  [Tile.LEAVES]: (rand) => () => (rand() < 0.18 ? [0, 0, 0, 0] : vary(rand, [58, 122, 42], 0.4)),
  [Tile.PLANKS]: (rand) => (x, y) => {
    const row = Math.floor(y / 4);
    const seam = y % 4 === 3 || x === (row * 7 + 3) % TILE_SIZE;
    return vary(rand, [170, 136, 84], 0.1, seam ? 0.7 : 1);
  },
  [Tile.COBBLESTONE]: (rand) => {
    const cells = Array.from({ length: 9 }, () => ({
      x: rand() * TILE_SIZE,
      y: rand() * TILE_SIZE,
      tone: 105 + rand() * 45,
    }));
    return (x, y) => {
      // Wrap-around distances so the tile repeats seamlessly.
      const dist = cells
        .map((c) => {
          const dx = Math.min(Math.abs(x - c.x), TILE_SIZE - Math.abs(x - c.x));
          const dy = Math.min(Math.abs(y - c.y), TILE_SIZE - Math.abs(y - c.y));
          return { d: Math.hypot(dx, dy), tone: c.tone };
        })
        .sort((a, b) => a.d - b.d);
      if (dist[1].d - dist[0].d < 1.1) return vary(rand, [78, 78, 80], 0.1);
      return vary(rand, [dist[0].tone, dist[0].tone, dist[0].tone + 2], 0.12);
    };
  },
  [Tile.GLASS]: () => (x, y) => {
    const edge = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
    const shine = (x - y === 4 && x > 5 && x < 11) || (x - y === 7 && x > 8 && x < 13);
    if (edge) return [214, 232, 238, 255];
    if (shine) return [250, 252, 255, 255];
    return [0, 0, 0, 0];
  },
  [Tile.BRICKS]: (rand) => (x, y) => {
    const row = Math.floor(y / 4);
    const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
    return mortar ? vary(rand, [198, 192, 182], 0.06) : vary(rand, [158, 66, 50], 0.18);
  },
  [Tile.CRAFTING_TABLE_TOP]: (rand) => (x, y) => {
    const edge = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
    const grid = x === 5 || x === 10 || y === 5 || y === 10;
    return vary(rand, edge ? [110, 78, 44] : grid ? [132, 98, 58] : [178, 142, 90], 0.1);
  },
  [Tile.CRAFTING_TABLE_SIDE]: (rand) => (x, y) => {
    if (y < 3) return vary(rand, [110, 78, 44], 0.12);
    if (x < 3 || x > 12) return vary(rand, [158, 122, 74], 0.12); // legs
    // Tools hanging between the legs: a saw blade and a hammer.
    if (y === 6 && x >= 4 && x <= 8) return vary(rand, [176, 176, 182], 0.05);
    if (x === 4 && y >= 6 && y <= 9) return vary(rand, [120, 88, 52], 0.05);
    if (y === 5 && x >= 9 && x <= 11) return vary(rand, [150, 150, 156], 0.05);
    if (x === 10 && y >= 6 && y <= 11) return vary(rand, [120, 88, 52], 0.05);
    return vary(rand, [90, 64, 38], 0.12);
  },
  [Tile.STICK]: () => (x, y) => {
    const { a, p } = diagonal(x, y);
    return handle(a, p, -11, 11) ?? CLEAR;
  },
  [Tile.WOODEN_SWORD]: swordPainter([150, 112, 64], [196, 160, 104]),
  [Tile.STONE_SWORD]: swordPainter([112, 112, 118], [172, 172, 180]),
  [Tile.STONE_AXE]: () => (x, y) => {
    const { a, p } = diagonal(x, y);
    if (a >= 3 && a <= 10 && p >= -6 && p <= -1) {
      return opaque(
        p <= -5 ? [178, 178, 186] : a === 3 || a === 10 ? [96, 96, 102] : [134, 134, 140],
      );
    }
    return handle(a, p, -12, 11) ?? CLEAR;
  },
  [Tile.CASTLE_STONE]: (rand) => castleStone(rand, false),
  [Tile.CRACKED_STONE]: (rand) => castleStone(rand, true),
  [Tile.PORTCULLIS]: (rand) => (x, y) => {
    const bar = x % 5 === 1 || x % 5 === 2;
    const rail = y % 8 === 2 || y % 8 === 3;
    if (!bar && !rail) return CLEAR;
    const spike = y >= TILE_SIZE - 2 && !rail;
    return vary(rand, bar && rail ? [92, 92, 100] : [64, 64, 72], 0.1, spike ? 0.8 : 1);
  },
  [Tile.CHEST_SIDE]: (rand) => (x, y) => {
    const frame = x === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
    if (y === 5 || y === 6) {
      if (x >= 6 && x <= 9 && y >= 5) return vary(rand, [236, 196, 70], 0.06); // latch
      return vary(rand, [70, 64, 60], 0.08); // iron band under the lid
    }
    if (x >= 7 && x <= 8 && y === 7) return vary(rand, [236, 196, 70], 0.06);
    return vary(rand, frame ? [104, 66, 30] : [156, 104, 48], 0.12, y % 4 === 0 ? 0.9 : 1);
  },
  [Tile.CHEST_TOP]: (rand) => (x, y) => {
    if (x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1)
      return vary(rand, [70, 64, 60], 0.08);
    if (x === 5 || x === 10) return vary(rand, [80, 74, 68], 0.08);
    return vary(rand, [164, 110, 52], 0.12, y % 4 === 0 ? 0.9 : 1);
  },
  [Tile.GOLD]: (rand) => (x, y) => {
    const edge = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
    const shine = (x + y === 6 || x + y === 7) && x > 1 && y > 1;
    if (shine) return [255, 250, 200, 255];
    return vary(rand, edge ? [198, 148, 36] : [240, 196, 64], 0.08);
  },
  [Tile.RUNE_SWORD]: swordPainter([70, 170, 210], [196, 244, 255]),
  [Tile.DARK_STONE]: (rand) => castleStone(rand, false, [70, 64, 82], [34, 30, 42]),
  // Large square slabs; the crumbling ones use the same tile, so they cannot be told apart.
  [Tile.FLAGSTONE]: (rand) => (x, y) => {
    if (x === 0 || y === 0) return vary(rand, [62, 58, 56], 0.08);
    const k = x === 1 || y === 1 ? 1.12 : x === 15 || y === 15 ? 0.88 : 1;
    return vary(rand, [118, 112, 104], 0.1, k);
  },
  [Tile.SPIKES]: (rand) => (x, y) => {
    const centre = Math.floor(x / 4) * 4 + 1.5;
    const height = 13 - Math.abs(x - centre) * 5;
    if (TILE_SIZE - 1 - y > height) return CLEAR;
    const tip = TILE_SIZE - 1 - y > height - 3;
    return vary(rand, tip ? [214, 214, 222] : [118, 118, 128], 0.08);
  },
  [Tile.SPIKES_TOP]: (rand) => (x, y) => {
    const dx = (x % 4) - 1.5;
    const dy = (y % 4) - 1.5;
    if (Math.abs(dx) + Math.abs(dy) > 1.5) return CLEAR;
    return vary(rand, Math.abs(dx) + Math.abs(dy) < 1 ? [220, 220, 228] : [120, 120, 130], 0.08);
  },
  [Tile.PLATE]: (rand) => (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return vary(rand, [62, 58, 56], 0.08);
    const inner = x >= 3 && x <= 12 && y >= 3 && y <= 12;
    return vary(rand, inner ? [214, 176, 70] : [150, 122, 52], 0.08, x === 3 || y === 3 ? 1.15 : 1);
  },
  [Tile.RUNE_AXE]: () => (x, y) => {
    const { a, p } = diagonal(x, y);
    if (a >= 3 && a <= 10 && p >= -6 && p <= -1) {
      return opaque(
        p <= -5 ? [196, 244, 255] : a === 3 || a === 10 ? [40, 110, 150] : [70, 170, 210],
      );
    }
    return handle(a, p, -12, 11) ?? CLEAR;
  },
  [Tile.STONE_BRICKS]: (rand) => (x, y) => {
    const row = Math.floor(y / 8);
    const mortar = y % 8 === 7 || (x + (row % 2) * 8) % 16 === 15;
    if (mortar) return vary(rand, [86, 86, 90], 0.08);
    const highlight = y % 8 === 0 || (x + (row % 2) * 8) % 16 === 0;
    return vary(rand, [138, 138, 142], 0.1, highlight ? 1.12 : 1);
  },
};

/** Large dark blocks: the castle's unbreakable stone, optionally cracked (the breakable one). */
function castleStone(
  rand: () => number,
  cracked: boolean,
  stone: [number, number, number] = [96, 100, 114],
  mortar: [number, number, number] = [52, 54, 64],
): Painter {
  return (x, y) => {
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    if (y % 8 === 7 || bx === 15) return vary(rand, mortar, 0.08);
    if (cracked) {
      // A jagged crack running across the face.
      const crack = Math.round(7 + Math.sin(x * 0.9) * 2 + (x > 8 ? (x - 8) * 0.6 : 0));
      if (y === crack || (y === crack + 1 && x % 3 === 0)) return vary(rand, [36, 37, 44], 0.1);
    }
    const edge = y % 8 === 0 || bx === 0;
    return vary(rand, stone, 0.12, edge ? 1.1 : 1);
  };
}

export function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_SIZE;
  canvas.height = ATLAS_ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  const image = ctx.createImageData(canvas.width, canvas.height);

  for (const [tileKey, factory] of Object.entries(PAINTERS)) {
    const tile = Number(tileKey);
    const paint = factory(mulberry32(tile + 1));
    const ox = (tile % ATLAS_COLS) * TILE_SIZE;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const i = ((oy + y) * canvas.width + ox + x) * 4;
        image.data.set(paint(x, y), i);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function createAtlasTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
