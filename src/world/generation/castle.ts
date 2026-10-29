import { BlockId } from '../blocks';
import { Blueprint, mulberry32, zone, type CastlePos, type CastleZone } from './blueprint';

export { inZone, type CastlePos, type CastleZone } from './blueprint';

// The castle north of the spawn point. Built once as a small block volume (pure, deterministic)
// and stamped into every chunk it overlaps by the terrain generator (see blueprint.ts).
//
//   z −46 ┌──────────── north wall ── exit (after the guardian) ─┐
//         │ throne hall (+ secret room)  │ arena (3 waves)       │
//   z −36 │ corridor (trap → crypt)  ◄herse│                     │
//   z −32 ├──────────────────────────────┼─────────── ▲ ─────────┤
//         │ maze                       ──► chasm (pillar jumps)  │
//   z −17 ├─ ▲ ──────────────────────────┴───────────────────────┤
//         │ courtyard (welcome chest, crafting table)            │
//   z  −4 └──────────────────────── gate ────────────────────────┘
//      x −20                         x 0                       x 20

export const CASTLE = {
  minX: -20,
  maxX: 20,
  minZ: -46,
  maxZ: -4,
  minR: -8,
  maxR: 14,
  /** Ground kept flat around the walls, then blended back to the natural terrain. */
  flat: 10,
  blend: 8,
} as const;

/** Where a new game starts: on the levelled ground in front of the gate, facing it (yaw 0). */
export const CASTLE_SPAWN = { x: 0.5, z: 12.5 } as const;

export type ChestId = 'welcome' | 'maze' | 'crypt' | 'secret' | 'throne';

export interface CastleLayout {
  blueprint: Blueprint;
  chests: Record<ChestId, CastlePos>;
}

/** Places where the castle reacts to the player (see castle/Castle.ts). */
export const CASTLE_ZONES = {
  courtyard: zone(-19, 19, 1, 6, -16, -5),
  maze: zone(-19, -1, 1, 6, -31, -18),
  chasm: zone(1, 19, 0, 6, -31, -18),
  pit: zone(3, 17, -4, -2, -31, -18),
  arena: zone(2, 17, 1, 6, -44, -34),
  trap: zone(-10, -6, 1, 3, -35, -33),
  hall: zone(-19, -1, 1, 6, -45, -37),
} as const;

/** Rooms where survival players cannot build (the trials would be trivial). */
export const PROTECTED = zone(CASTLE.minX, CASTLE.maxX, CASTLE.minR, CASTLE.maxR, CASTLE.minZ, -17);

export const CASTLE_DOORS = {
  arenaEntrance: zone(18, 18, 1, 3, -32, -32),
  arenaExit: zone(0, 0, 1, 3, -34, -34),
  northExit: zone(-15, -14, 1, 3, -46, -46),
} as const;

/** Floor blocks that give way under the player. */
export const TRAP_FLOOR = zone(-10, -6, 0, 0, -35, -33);

export const ARENA_CENTER: CastlePos = { x: 10, r: 1, z: -39 };
export const ARENA_SPAWNS: readonly CastlePos[] = [
  { x: 7, r: 1, z: -38 },
  { x: 13, r: 1, z: -38 },
  { x: 10, r: 1, z: -43 },
  { x: 10, r: 1, z: -35 },
];
export const PIT_SPAWNS: readonly CastlePos[] = [
  { x: 12, r: -4, z: -30 },
  { x: 14, r: -4, z: -20 },
];
export const CRYPT_SPAWNS: readonly CastlePos[] = [
  { x: -16, r: -4, z: -34 },
  { x: -12, r: -4, z: -34 },
];
export const GUARDIAN_SPAWN: CastlePos = { x: -11, r: 1, z: -40 };

let cached: CastleLayout | null = null;

/** The castle's blocks and chest positions. Same every time: the layout does not depend on the seed. */
export function castleLayout(): CastleLayout {
  cached ??= buildCastle();
  return cached;
}

function buildCastle(): CastleLayout {
  const bp = new Blueprint(CASTLE);
  const fill = (z: CastleZone, id: number) => bp.fill(z, id);
  const box = (
    x0: number,
    x1: number,
    r0: number,
    r1: number,
    z0: number,
    z1: number,
    id: number,
  ) => bp.box(x0, x1, r0, r1, z0, z1, id);
  const set = (x: number, r: number, z: number, id: number) => bp.set(x, r, z, id);
  const { minX, maxX, minZ, maxZ } = CASTLE;
  const S = BlockId.CASTLE_STONE;

  // Foundation, floor, outer walls with battlements, roof over the trial rooms.
  box(minX, maxX, CASTLE.minR, 0, minZ, maxZ, S);
  box(minX, maxX, 1, 8, minZ, minZ, S);
  box(minX, maxX, 1, 8, maxZ, maxZ, S);
  box(minX, minX, 1, 8, minZ, maxZ, S);
  box(maxX, maxX, 1, 8, minZ, maxZ, S);
  for (let x = minX; x <= maxX; x += 2) {
    set(x, 9, minZ, S);
    set(x, 9, maxZ, S);
  }
  for (let z = minZ; z <= maxZ; z += 2) {
    set(minX, 9, z, S);
    set(maxX, 9, z, S);
  }
  box(minX, maxX, 7, 7, minZ, -17, S);
  box(minX, maxX, 1, 8, -17, -17, S); // courtyard | maze & chasm
  box(minX, maxX, 1, 6, -32, -32, S); // maze & chasm | corridor, hall & arena
  box(0, 0, 1, 6, -31, -18, S);
  box(0, 0, 1, 6, -45, -33, S);
  box(minX, 0, 1, 6, -36, -36, S); // corridor | throne hall

  // Corner towers and the gatehouse.
  const tower = (x0: number, z0: number, top: number) => {
    box(x0, x0 + 4, 1, top, z0, z0 + 4, S);
    for (let i = 0; i <= 4; i += 2) {
      set(x0 + i, top + 1, z0, S);
      set(x0 + i, top + 1, z0 + 4, S);
      set(x0, top + 1, z0 + i, S);
      set(x0 + 4, top + 1, z0 + i, S);
    }
  };
  tower(minX, maxZ - 4, 11);
  tower(maxX - 4, maxZ - 4, 11);
  tower(minX, minZ, 11);
  tower(maxX - 4, minZ, 11);
  box(-4, -2, 1, 10, maxZ - 2, maxZ, S);
  box(2, 4, 1, 10, maxZ - 2, maxZ, S);
  box(-1, 1, 9, 10, maxZ, maxZ, S);
  box(-1, 1, 1, 4, maxZ, maxZ, BlockId.AIR); // the gate
  for (const z of [-21, -25, -29, -38, -42]) box(maxX, maxX, 3, 4, z, z, BlockId.PORTCULLIS); // barred windows
  for (const z of [-21, -25, -29]) box(minX, minX, 3, 4, z, z, BlockId.PORTCULLIS);

  // Courtyard: lawn, paths, a crafting table, the welcome chest and two trees.
  box(-19, 19, 0, 0, -16, -5, BlockId.GRASS);
  box(-1, 1, 0, 0, -16, -5, BlockId.COBBLESTONE);
  box(-18, -1, 0, 0, -16, -15, BlockId.COBBLESTONE);
  box(-18, -18, 1, 3, -17, -17, BlockId.AIR); // into the maze
  set(-3, 1, -8, BlockId.CRAFTING_TABLE);
  const welcome = { x: 3, r: 1, z: -8 };
  for (const [tx, tz] of [
    [-11, -10],
    [11, -10],
  ]) {
    box(tx - 1, tx + 1, 4, 5, tz - 1, tz + 1, BlockId.LEAVES);
    set(tx, 6, tz, BlockId.LEAVES);
    box(tx, tx, 1, 4, tz, tz, BlockId.LOG);
  }
  box(6, 8, 1, 1, -14, -14, BlockId.PLANKS); // benches
  box(-8, -6, 1, 1, -14, -14, BlockId.PLANKS);

  // Trial 1, the maze: 9 × 6 cells carved by a seeded recursive backtracker.
  box(-19, -1, 1, 6, -31, -18, S);
  const cellsX = 9;
  const cellsZ = 6;
  const cellX = (i: number) => -18 + i * 2;
  const cellZ = (j: number) => -19 - j * 2;
  const carve = (x: number, z: number) => box(x, x, 1, 6, z, z, BlockId.AIR);
  const visited = new Uint8Array(cellsX * cellsZ);
  const open = Array.from({ length: cellsX * cellsZ }, () => 0); // passages per cell
  const rand = mulberry32(20261029);
  const stack: [number, number][] = [[0, 0]];
  visited[0] = 1;
  carve(cellX(0), cellZ(0));
  while (stack.length > 0) {
    const [i, j] = stack[stack.length - 1];
    const next = (
      [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ] as [number, number][]
    ).filter(([a, b]) => a >= 0 && b >= 0 && a < cellsX && b < cellsZ && !visited[a + b * cellsX]);
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rand() * next.length)];
    visited[a + b * cellsX] = 1;
    open[i + j * cellsX]++;
    open[a + b * cellsX]++;
    carve((cellX(i) + cellX(a)) / 2, (cellZ(j) + cellZ(b)) / 2);
    carve(cellX(a), cellZ(b));
    stack.push([a, b]);
  }
  carve(-18, -18); // from the courtyard door into the first cell
  const exitCell = [cellsX - 1, 4];
  carve(-1, cellZ(exitCell[1]));
  box(0, 0, 1, 3, cellZ(exitCell[1]), cellZ(exitCell[1]), BlockId.AIR); // into the chasm

  // A chest waits in the dead end farthest from the entrance (breadth-first distances).
  const distance = new Int32Array(cellsX * cellsZ).fill(-1);
  distance[0] = 0;
  const queue = [0];
  const passable = (x: number, z: number) => bp.get(x, 1, z) === BlockId.AIR;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const i = c % cellsX;
    const j = Math.floor(c / cellsX);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= cellsX || b >= cellsZ || distance[a + b * cellsX] >= 0) continue;
      if (!passable(cellX(i) + di, cellZ(j) - dj)) continue;
      distance[a + b * cellsX] = distance[c] + 1;
      queue.push(a + b * cellsX);
    }
  }
  let mazeChest = 0;
  for (let c = 1; c < distance.length; c++) {
    const isExit = c === exitCell[0] + exitCell[1] * cellsX;
    if (open[c] === 1 && !isExit && distance[c] > distance[mazeChest]) mazeChest = c;
  }
  const maze = { x: cellX(mazeChest % cellsX), r: 1, z: cellZ(Math.floor(mazeChest / cellsX)) };

  // Trial 2, the chasm: a pit crossed on pillars of rising and falling heights.
  box(3, 17, -4, 0, -31, -18, BlockId.AIR);
  const pillar = (x0: number, x1: number, z0: number, z1: number, top: number) =>
    box(x0, x1, -4, top, z0, z1, S);
  pillar(4, 4, -29, -29, 0);
  pillar(6, 6, -29, -29, 1);
  pillar(8, 8, -27, -27, 1);
  pillar(8, 8, -24, -24, 1);
  pillar(10, 10, -22, -22, 2);
  pillar(12, 13, -23, -22, 2);
  pillar(16, 16, -23, -23, 1);
  pillar(16, 16, -26, -26, 1);
  // Stairs out of the pit, back to the start ledge.
  [-4, -3, -2, -1, 0, 0].forEach((top, k) => pillar(8 - k, 8 - k, -18, -18, top));
  fill(CASTLE_DOORS.arenaEntrance, BlockId.AIR);

  // Trial 3, the arena: a sand floor around four pillars; the exit stays barred until the end.
  box(1, 19, 0, 0, -45, -33, BlockId.SAND);
  for (const [px, pz] of [
    [5, -36],
    [15, -36],
    [5, -42],
    [13, -42],
  ]) {
    box(px, px, 1, 6, pz, pz, BlockId.STONE_BRICKS);
  }
  fill(CASTLE_DOORS.arenaExit, BlockId.PORTCULLIS);

  // The corridor hides a collapsing floor above a crypt; stairs lead back up.
  box(-16, -4, -4, -1, -35, -33, BlockId.AIR);
  [-4, -3, -2, -1].forEach((top, k) => box(-12 - k, -12 - k, -4, top, -35, -35, S));
  box(-15, -13, 0, 0, -35, -35, BlockId.AIR);
  const crypt = { x: -4, r: -4, z: -35 };

  // Throne hall: carpet, pillars, a golden throne, the final chest; a secret room behind cracks.
  box(-18, -18, 1, 3, -36, -36, BlockId.AIR);
  box(-11, -9, 0, 0, -44, -37, BlockId.BRICKS);
  box(-18, -12, 0, 0, -38, -38, BlockId.BRICKS);
  for (const [px, pz] of [
    [-16, -40],
    [-4, -38],
    [-14, -42],
  ]) {
    box(px, px, 1, 6, pz, pz, BlockId.STONE_BRICKS);
  }
  box(-13, -7, 1, 1, -45, -44, BlockId.STONE_BRICKS);
  set(-10, 2, -44, BlockId.GOLD);
  box(-10, -10, 2, 4, -45, -45, BlockId.GOLD);
  box(-11, -11, 2, 3, -44, -44, BlockId.GOLD); // armrests
  box(-9, -9, 2, 3, -44, -44, BlockId.GOLD);
  const throne = { x: -10, r: 1, z: -42 };
  box(-6, -6, 1, 6, -45, -41, S);
  box(-6, -1, 1, 6, -41, -41, S);
  box(-6, -6, 1, 2, -43, -43, BlockId.CRACKED_STONE);
  box(-2, -1, 1, 1, -45, -45, BlockId.GOLD);
  const secret = { x: -3, r: 1, z: -44 };
  fill(CASTLE_DOORS.northExit, BlockId.PORTCULLIS);

  const chests = { welcome, maze, crypt, secret, throne };
  for (const c of Object.values(chests)) set(c.x, c.r, c.z, BlockId.CHEST);
  return { blueprint: bp, chests };
}

/** Where the castle floor is measured (the average ground height there). */
export const CASTLE_FLOOR_SAMPLES: readonly [number, number][] = [
  [0, -25],
  [-15, -10],
  [15, -10],
  [-15, -40],
  [15, -40],
  [0, 0],
];
