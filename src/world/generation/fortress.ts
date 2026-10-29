import { BlockId } from '../blocks';
import { Blueprint, zone, type CastlePos, type CastleZone } from './blueprint';

// The Black Fortress, east of the first castle and harder: more traps, fewer monsters.
// Nine rooms in a 3 × 3 grid, visited in this order (gate on the west side, facing the castle):
//
//   z −39 ┌───────────┬───────────┬───────────┐
//         │ 2 golden  ► 3 rhythm  ► 4 false   │   N row
//         │   path    │   spikes  │   chest   │
//   z −28 ├─── ▲ ─────┼───────────┼── cracks ─┤
//    gate ► 1 hall    ◄ 9 treasure│ 5 race    │   M row
//         │           │           │ (plate)   │
//   z −17 ├─ cracks ──┼──── ▲ ────┼─── ▼ ─────┤
//         │ secret    │ 8 lone    ◄ 6/7 fragile│  S row
//         │  room     │  guardian │   bridge  │
//   z  −6 └───────────┴───────────┴───────────┘
//      x 58        x 70        x 82        x 94

export const FORTRESS = {
  minX: 58,
  maxX: 94,
  minZ: -39,
  maxZ: -6,
  minR: -8,
  maxR: 14,
  flat: 8,
  blend: 8,
} as const;

export const FORTRESS_FLOOR_SAMPLES: readonly [number, number][] = [
  [76, -22],
  [62, -10],
  [90, -10],
  [62, -35],
  [90, -35],
  [50, -22],
];

/** Room interiors (x, z), without walls. */
const A = [59, 69] as const;
const B = [71, 81] as const;
const C = [83, 93] as const;
const S = [-16, -7] as const;
const M = [-27, -18] as const;
const N = [-38, -29] as const;
const room = (x: readonly [number, number], z: readonly [number, number], r0 = 0, r1 = 6) =>
  zone(x[0], x[1], r0, r1, z[0], z[1]);

/** Places where the fortress reacts to the player (see castle/Fortress.ts). */
export const FORTRESS_ZONES = {
  approach: zone(44, 57, -2, 8, -27, -17),
  hall: room(A, M, 1),
  golden: room(A, N, 1),
  rhythm: room(B, N, 0),
  mimic: room(C, N, 1),
  race: room(C, M, 1),
  bridge: room(C, S, 1),
  guardian: room(B, S, 1),
  treasure: room(B, M, 1),
  secret: room(A, S, 1),
} as const;

export const FORTRESS_DOORS = {
  raceExit: zone(88, 89, 1, 3, -17, -17),
  guardianExit: zone(76, 76, 1, 3, -17, -17),
  shortcut: zone(70, 70, 1, 3, -23, -22),
} as const;

/** Spike columns of the rhythm room, by group: each group rises and falls in turn. */
export const RHYTHM_GROUPS: readonly (readonly number[])[] = [
  [72, 73],
  [75, 76],
  [78, 79, 80],
];
export const RHYTHM_Z = N;

/** Floor that turns into spikes when the false chest is opened (the chest cell stays). */
export const MIMIC_FLOOR = zone(84, 92, 0, 0, -37, -31);
export const MIMIC_SPAWN: CastlePos = { x: 90, r: 0, z: -36 };
export const GUARDIAN_SPAWN: CastlePos = { x: 76, r: 1, z: -12 };

export const CHECKPOINTS: Partial<Record<keyof typeof FORTRESS_ZONES, CastlePos>> = {
  hall: { x: 61, r: 1, z: -22 },
  race: { x: 92, r: 1, z: -27 },
};

export type FortressChestId = 'mimic' | 'treasure' | 'secret';

export interface FortressLayout {
  blueprint: Blueprint;
  chests: Record<FortressChestId, CastlePos>;
  /** Cells of the golden path (safe), for tests. */
  goldenPath: readonly [number, number][];
}

let cached: FortressLayout | null = null;

export function fortressLayout(): FortressLayout {
  cached ??= buildFortress();
  return cached;
}

function buildFortress(): FortressLayout {
  const bp = new Blueprint(FORTRESS);
  const box = (
    x0: number,
    x1: number,
    r0: number,
    r1: number,
    z0: number,
    z1: number,
    id: number,
  ) => bp.box(x0, x1, r0, r1, z0, z1, id);
  const fill = (z: CastleZone, id: number) => bp.fill(z, id);
  const { minX, maxX, minZ, maxZ } = FORTRESS;
  const W = BlockId.DARK_STONE;
  const F = BlockId.FLAGSTONE;

  // Shell: foundation, flagstone floors, outer walls with battlements, roof, inner walls.
  box(minX, maxX, FORTRESS.minR, 0, minZ, maxZ, W);
  box(minX, maxX, 0, 0, minZ, maxZ, F);
  bp.walls(minX, maxX, 1, 8, minZ, maxZ, W);
  for (let x = minX; x <= maxX; x += 2) {
    bp.set(x, 9, minZ, W);
    bp.set(x, 9, maxZ, W);
  }
  for (let z = minZ; z <= maxZ; z += 2) {
    bp.set(minX, 9, z, W);
    bp.set(maxX, 9, z, W);
  }
  box(minX, maxX, 7, 7, minZ, maxZ, W);
  for (const x of [70, 82]) box(x, x, 1, 6, minZ, maxZ, W);
  for (const z of [-17, -28]) box(minX, maxX, 1, 6, z, z, W);
  // Corner towers stand on the roof, so they never eat into the rooms below.
  const tower = (x0: number, z0: number) => {
    box(x0, x0 + 4, 7, 12, z0, z0 + 4, W);
    for (let i = 0; i <= 4; i += 2) {
      bp.set(x0 + i, 13, z0, W);
      bp.set(x0 + i, 13, z0 + 4, W);
      bp.set(x0, 13, z0 + i, W);
      bp.set(x0 + 4, 13, z0 + i, W);
    }
  };
  tower(minX, minZ);
  tower(maxX - 4, minZ);
  tower(minX, maxZ - 4);
  tower(maxX - 4, maxZ - 4);
  box(minX, minX + 1, 1, 11, -26, -24, W); // gatehouse
  box(minX, minX + 1, 1, 11, -20, -18, W);
  box(minX, minX, 9, 11, -23, -21, W);
  box(minX, minX + 1, 1, 4, -23, -21, BlockId.AIR); // the gate
  for (const x of [64, 76, 88]) {
    box(x, x, 3, 4, minZ, minZ, BlockId.PORTCULLIS); // barred windows
    box(x, x, 3, 4, maxZ, maxZ, BlockId.PORTCULLIS);
  }

  // 1. Hall: a crafting table, pillars; cracks to the secret room, a door north, the shortcut barred.
  bp.set(67, 1, -26, BlockId.CRAFTING_TABLE);
  for (const [px, pz] of [
    [63, -20],
    [66, -20],
    [63, -25],
    [66, -25],
  ]) {
    box(px, px, 1, 6, pz, pz, BlockId.STONE_BRICKS);
  }
  box(64, 64, 1, 2, -17, -17, BlockId.CRACKED_STONE);
  box(64, 64, 1, 3, -28, -28, BlockId.AIR);
  fill(FORTRESS_DOORS.shortcut, BlockId.PORTCULLIS);

  // 2. The golden path: only the slabs under the gold in the ceiling hold. The others crumble
  //    into a spike pit; stairs in the corner lead back up.
  box(A[0], A[1], -2, -1, N[0] + 1, N[1] - 1, BlockId.AIR);
  box(A[0], A[1], -2, -2, N[0] + 1, N[1] - 1, BlockId.SPIKES);
  box(A[0], A[1], 0, 0, N[0] + 1, N[1] - 1, BlockId.CRUMBLE);
  const goldenPath: [number, number][] = [
    [64, -30],
    [64, -31],
    [63, -31],
    [62, -31],
    [62, -32],
    [62, -33],
    [63, -33],
    [64, -33],
    [65, -33],
    [66, -33],
    [66, -34],
    [66, -35],
    [65, -35],
    [64, -35],
    [64, -36],
    [64, -37],
  ];
  for (const [x, z] of goldenPath) {
    bp.set(x, 0, z, F);
    bp.set(x, 6, z, BlockId.GOLD);
  }
  [-2, -1, 0, 0].forEach((top, k) => box(59, 59, -2, top, -33 + k, -33 + k, W));
  box(70, 70, 1, 3, -38, -38, BlockId.AIR);

  // 3. Rhythm spikes: the floor is one step down and spikes rise and fall by groups of columns.
  box(B[0] + 1, B[1] - 1, -1, -1, N[0], N[1], F);
  box(B[0] + 1, B[1] - 1, 0, 0, N[0], N[1], BlockId.AIR);
  for (const group of RHYTHM_GROUPS)
    for (const x of group) box(x, x, 0, 0, N[0], N[1], BlockId.SPIKES);
  box(82, 82, 1, 3, -30, -30, BlockId.AIR);

  // 4. A chest far too beautiful, among gold. The way on is a cracked wall.
  const mimic = { x: 88, r: 1, z: -34 };
  for (const [gx, gz] of [
    [85, -31],
    [91, -31],
    [85, -37],
    [91, -37],
  ]) {
    box(gx, gx, 1, 2, gz, gz, BlockId.GOLD);
  }
  box(87, 89, 0, 0, -35, -33, BlockId.GOLD);
  box(90, 90, 1, 2, -28, -28, BlockId.CRACKED_STONE);

  // 5. The race: stepping on the plate opens the far portcullis for a few seconds.
  bp.set(90, 0, -26, BlockId.PLATE);
  box(C[0], C[1], 1, 1, -24, -24, W); // a low wall to jump
  box(C[0], C[1], 0, 0, -22, -22, BlockId.SPIKES); // a strip of spikes to jump over
  box(85, C[1], 1, 2, -20, -20, W); // a high wall: go round by the west
  fill(FORTRESS_DOORS.raceExit, BlockId.PORTCULLIS);

  // 6–7. The fragile bridge: floating slabs over a spike pit, some of which crumble.
  box(C[0], C[1], -3, 0, S[0], S[1], BlockId.AIR);
  box(C[0], C[1], -3, -3, S[0], S[1], BlockId.SPIKES);
  box(88, 93, -3, 0, -16, -16, W); // landing under the portcullis
  [0, 0, -1, -2, -3].forEach((top, k) => box(93, 93, -3, top, -15 + k, -15 + k, W)); // stairs out
  bp.set(90, 0, -13, F);
  bp.set(92, 1, -11, BlockId.CRUMBLE);
  bp.set(90, 1, -8, F);
  bp.set(87, 1, -8, BlockId.CRUMBLE);
  bp.set(85, 2, -10, F);
  bp.set(85, 2, -13, BlockId.CRUMBLE);
  box(83, 83, -3, 1, -13, -11, W); // far ledge
  box(82, 82, 2, 4, -12, -12, BlockId.AIR);

  // 8. The lone guardian, on narrow bridges over spikes: its blows knock you off.
  box(B[0], B[1], 0, 0, S[0], S[1], BlockId.SPIKES);
  box(81, 81, 0, 0, -13, -11, F); // landing from the bridge room
  box(78, 80, 0, 0, -12, -12, F);
  box(75, 77, 0, 0, -14, -10, F); // island
  box(76, 76, 0, 0, -16, -15, F);
  box(72, 74, 0, 0, -12, -12, F);
  box(71, 72, 0, 0, -14, -10, F);
  fill(FORTRESS_DOORS.guardianExit, BlockId.PORTCULLIS);

  // 9. The treasure room: a golden dais and the fortress's treasure.
  box(B[0] + 1, B[1] - 1, 0, 0, M[0] + 1, M[1] - 1, BlockId.BRICKS);
  box(74, 78, 0, 0, -26, -22, BlockId.GOLD);
  const treasure = { x: 76, r: 1, z: -24 };
  for (const [gx, gz] of [
    [72, -19],
    [80, -19],
    [72, -26],
    [80, -26],
  ]) {
    box(gx, gx, 1, 3, gz, gz, BlockId.GOLD);
  }

  // Secret room, behind the hall's cracked wall.
  const secret = { x: 64, r: 1, z: -11 };
  box(62, 66, 0, 0, -13, -9, BlockId.GOLD);

  const chests = { mimic, treasure, secret };
  for (const c of Object.values(chests)) bp.set(c.x, c.r, c.z, BlockId.CHEST);
  return { blueprint: bp, chests, goldenPath };
}
