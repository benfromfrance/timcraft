import { BlockId } from '../blocks';
import { Blueprint, mulberry32, zone, type CastlePos } from './blueprint';

// The Cursed Citadel, west of the first castle: the hardest of the three. No monsters at all,
// only traps. Nine rooms in a 3 × 3 grid, visited in this order (gate on the east side):
//
//   z −39 ┌───────────┬───────────┬───────────┐
//         │ 3 rhythm  ◄ 2 ghost   ◄ 1 arrow   │   N row
//         │ platforms │   bridge  │  corridor │
//   z −28 ├─── ▼ ─────┼───────────┼──── ▲ ────┤
//         │ 4 wind    │ 7 treasure► hall      ◄ gate
//         │  bridge   │ (collapse)│           │   M row
//   z −17 ├─── ▼ ─────┼──── ▲ ────┼─ cracks ──┤
//         │ 5 falling ► 6 trapped │ secret    │   S row
//         │   rocks   │   maze    │  room     │
//   z  −6 └───────────┴───────────┴───────────┘
//      x −96       x −84       x −72       x −60

export const CITADEL = {
  minX: -96,
  maxX: -60,
  minZ: -39,
  maxZ: -6,
  minR: -8,
  maxR: 14,
  flat: 8,
  blend: 8,
} as const;

export const CITADEL_FLOOR_SAMPLES: readonly [number, number][] = [
  [-78, -22],
  [-90, -10],
  [-66, -10],
  [-90, -35],
  [-66, -35],
  [-50, -22],
];

/** Room interiors (x, z), without walls. */
const A = [-95, -85] as const;
const B = [-83, -73] as const;
const C = [-71, -61] as const;
const S = [-16, -7] as const;
const M = [-27, -18] as const;
const N = [-38, -29] as const;
const room = (x: readonly [number, number], z: readonly [number, number], r0 = 1, r1 = 6) =>
  zone(x[0], x[1], r0, r1, z[0], z[1]);

/** Places where the citadel reacts to the player (see castle/Citadel.ts). */
export const CITADEL_ZONES = {
  approach: zone(-59, -46, -2, 8, -27, -17),
  hall: room(C, M),
  arrows: room(C, N),
  ghost: room(B, N, -2),
  platforms: room(A, N, -2),
  wind: room(A, M, -2),
  rocks: room(A, S, -1),
  maze: room(B, S),
  treasure: room(B, M, -1),
  secret: room(C, S),
} as const;

export const CITADEL_ROOMS = { A, B, C, S, M, N } as const;

export const CITADEL_DOORS = {
  escape: zone(-72, -72, 1, 3, -23, -22),
} as const;

export const CITADEL_CHECKPOINTS: Partial<Record<keyof typeof CITADEL_ZONES, CastlePos>> = {
  hall: { x: -63, r: 1, z: -22 },
  wind: { x: -93, r: 1, z: -27 },
  maze: { x: -83, r: 1, z: -8 },
};

/** Arrow launchers in the corridor walls: north ones shoot south (+z), south ones north. */
export const ARROW_SHOOTERS: readonly {
  x: number;
  r: number;
  z: number;
  dz: number;
  phase: number;
}[] = [
  { x: -64, r: 1, z: -35, dz: 1, phase: 0 },
  { x: -65, r: 2, z: -32, dz: -1, phase: 0.4 },
  { x: -66, r: 2, z: -35, dz: 1, phase: 0.8 },
  { x: -67, r: 1, z: -32, dz: -1, phase: 1.2 },
  { x: -68, r: 1, z: -35, dz: 1, phase: 0.2 },
  { x: -69, r: 2, z: -32, dz: -1, phase: 0.6 },
  { x: -70, r: 2, z: -35, dz: 1, phase: 1.0 },
];

/** The invisible bridge, from the east ledge to the west one. */
export const GHOST_PATH: readonly [number, number][] = [
  [-74, -34],
  [-75, -34],
  [-75, -35],
  [-75, -36],
  [-76, -36],
  [-77, -36],
  [-78, -36],
  [-78, -35],
  [-78, -34],
  [-78, -33],
  [-78, -32],
  [-79, -32],
  [-80, -32],
  [-80, -31],
  [-80, -30],
  [-81, -30],
  [-82, -30],
];

/** Platforms appearing and vanishing in turn, by group. */
export const PLATFORM_GROUPS: readonly (readonly [number, number][])[] = [
  [
    [-86, -32],
    [-88, -34],
  ],
  [
    [-90, -36],
    [-92, -34],
  ],
  [[-94, -32]],
];

/** The narrow zigzag bridge of the wind room. */
export const WIND_PATH: readonly [number, number][] = [
  [-90, -26],
  [-90, -25],
  [-90, -24],
  [-89, -24],
  [-88, -24],
  [-88, -23],
  [-88, -22],
  [-88, -21],
  [-89, -21],
  [-90, -21],
  [-91, -21],
  [-92, -21],
  [-92, -20],
  [-92, -19],
  [-91, -19],
  [-90, -19],
];
/** Vents the gusts blow out of, west and east of the wind room (r, z). */
export const WIND_VENTS: readonly [number, number][] = [
  [1, -25],
  [2, -22],
  [1, -19],
];

export type CitadelChestId = 'treasure' | 'secret';

export interface CitadelLayout {
  blueprint: Blueprint;
  chests: Record<CitadelChestId, CastlePos>;
}

let cached: CitadelLayout | null = null;

export function citadelLayout(): CitadelLayout {
  cached ??= buildCitadel();
  return cached;
}

function buildCitadel(): CitadelLayout {
  const bp = new Blueprint(CITADEL);
  const box = (
    x0: number,
    x1: number,
    r0: number,
    r1: number,
    z0: number,
    z1: number,
    id: number,
  ) => bp.box(x0, x1, r0, r1, z0, z1, id);
  const { minX, maxX, minZ, maxZ } = CITADEL;
  const W = BlockId.CITADEL_STONE;
  const F = BlockId.FLAGSTONE;
  /** A pit over a room: spikes at `spikes`, air above it up to the floor level. */
  const pit = (x: readonly [number, number], z: readonly [number, number], spikes: number) => {
    box(x[0], x[1], spikes, 0, z[0], z[1], BlockId.AIR);
    box(x[0], x[1], spikes, spikes, z[0], z[1], BlockId.SPIKES);
  };

  // Shell: foundation, flagstone floors, outer walls with battlements, roof, inner walls.
  box(minX, maxX, CITADEL.minR, 0, minZ, maxZ, W);
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
  for (const x of [-84, -72]) box(x, x, 1, 6, minZ, maxZ, W);
  for (const z of [-17, -28]) box(minX, maxX, 1, 6, z, z, W);
  // Towers stand on the roof: a tall spire in the middle, four at the corners.
  const tower = (x0: number, z0: number, size: number, top: number) => {
    box(x0, x0 + size - 1, 7, top, z0, z0 + size - 1, W);
    for (let i = 0; i < size; i += 2) {
      bp.set(x0 + i, top + 1, z0, W);
      bp.set(x0 + i, top + 1, z0 + size - 1, W);
      bp.set(x0, top + 1, z0 + i, W);
      bp.set(x0 + size - 1, top + 1, z0 + i, W);
    }
  };
  tower(minX, minZ, 5, 11);
  tower(maxX - 4, minZ, 5, 11);
  tower(minX, maxZ - 4, 5, 11);
  tower(maxX - 4, maxZ - 4, 5, 11);
  tower(-80, -25, 5, 13);
  box(maxX - 1, maxX, 1, 11, -26, -24, W); // gatehouse
  box(maxX - 1, maxX, 1, 11, -20, -18, W);
  box(maxX, maxX, 9, 11, -23, -21, W);
  box(maxX - 1, maxX, 1, 4, -23, -21, BlockId.AIR); // the gate
  for (const x of [-90, -78, -66]) {
    box(x, x, 3, 4, minZ, minZ, BlockId.PORTCULLIS); // barred windows
    box(x, x, 3, 4, maxZ, maxZ, BlockId.PORTCULLIS);
  }

  // Hall: crafting table, pillars, a door north, cracks to the secret room, the escape barred.
  bp.set(-70, 1, -26, BlockId.CRAFTING_TABLE);
  for (const [px, pz] of [
    [-68, -20],
    [-64, -20],
    [-68, -25],
    [-64, -25],
  ]) {
    box(px, px, 1, 6, pz, pz, BlockId.STONE_BRICKS);
  }
  box(-62, -62, 1, 3, -28, -28, BlockId.AIR);
  box(-66, -66, 1, 2, -17, -17, BlockId.CRACKED_STONE);
  bp.fill(CITADEL_DOORS.escape, BlockId.PORTCULLIS);

  // 1. Arrow corridor: solid rock with a passage in and a corridor west, under fire from launchers.
  box(C[0], C[1], 1, 6, N[0], N[1], W);
  box(-62, -62, 1, 4, -32, -29, BlockId.AIR);
  box(-71, -62, 1, 4, -34, -33, BlockId.AIR);
  box(-72, -72, 1, 3, -34, -33, BlockId.AIR);
  for (const s of ARROW_SHOOTERS) bp.set(s.x, s.r, s.z, BlockId.ARROW_TRAP);

  // 2. Ghost bridge: an invisible path over spikes (it shows itself now and then).
  pit(B, N, -2);
  box(-73, -73, -2, 0, -34, -33, W);
  box(-83, -83, -2, 0, -30, -29, W);
  [-2, -1, 0].forEach((top, k) => box(-73, -73, -2, top, -37 + k, -37 + k, W)); // stairs out
  for (const [x, z] of GHOST_PATH) bp.set(x, 0, z, BlockId.GHOST);
  box(-84, -84, 1, 3, -30, -30, BlockId.AIR);

  // 3. Rhythm platforms over spikes: each group is there two seconds out of three.
  pit(A, N, -2);
  box(-85, -85, -2, 0, -30, -30, W);
  box(-95, -94, -2, 0, -30, -29, W);
  [-2, -1, 0].forEach((top, k) => box(-85, -85, -2, top, -33 + k, -33 + k, W)); // stairs out
  for (const group of PLATFORM_GROUPS) for (const [x, z] of group) bp.set(x, 0, z, F);
  box(-94, -94, 1, 3, -28, -28, BlockId.AIR);

  // 4. Wind bridge: a one-block zigzag over spikes, swept by gusts from the vents.
  pit(A, M, -2);
  box(-95, -90, -2, 0, -27, -27, W);
  box(-90, -90, -2, 0, -18, -18, W);
  [-2, -1, 0].forEach((top, k) => box(-95, -95, -2, top, -24 - k, -24 - k, W)); // stairs out
  for (const [x, z] of WIND_PATH) bp.set(x, 0, z, F);
  for (const [r, z] of WIND_VENTS) {
    bp.set(minX, r, z, BlockId.PORTCULLIS);
    bp.set(-84, r, z, BlockId.ARROW_TRAP);
  }
  box(-90, -90, 1, 3, -17, -17, BlockId.AIR);

  // 5. Falling rocks over crumbling slabs (a shallow spike pit beneath).
  box(A[0], A[1], -1, -1, S[0], S[1], BlockId.SPIKES);
  box(A[0], A[1], 0, 0, S[0], S[1], BlockId.CRUMBLE);
  box(A[0], A[1], 0, 0, -16, -16, F); // safe row under the door
  for (const [x, z] of [
    [-92, -12],
    [-88, -10],
    [-85, -8],
  ]) {
    bp.set(x, 0, z, F);
  }
  box(-84, -84, 1, 3, -8, -8, BlockId.AIR);

  // 6. Trapped maze: some floor slabs are pressure plates that raise spikes all around.
  box(B[0], B[1], 1, 6, S[0], S[1], W);
  const cellsX = 5;
  const cellsZ = 4;
  const cellX = (i: number) => -82 + i * 2;
  const cellZ = (j: number) => -8 - j * 2;
  const carve = (x: number, z: number) => box(x, x, 1, 6, z, z, BlockId.AIR);
  const visited = new Uint8Array(cellsX * cellsZ);
  const rand = mulberry32(31102026);
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
    carve((cellX(i) + cellX(a)) / 2, (cellZ(j) + cellZ(b)) / 2);
    carve(cellX(a), cellZ(b));
    stack.push([a, b]);
  }
  carve(-83, -8);
  carve(-78, -15);
  carve(-78, -16);
  box(-78, -78, 1, 3, -17, -17, BlockId.AIR);
  // Plates on every third block of the way through, and on a few others.
  const start: [number, number] = [-83, -8];
  const goal = '-78,-16';
  const previous = new Map<string, string>([[start.join(), '']]);
  const queue = [start];
  for (let q = 0; q < queue.length && !previous.has(goal); q++) {
    const [x, z] = queue[q];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const k = `${x + dx},${z + dz}`;
      if (previous.has(k) || x + dx < B[0] || x + dx > B[1] || z + dz < S[0] || z + dz > S[1])
        continue;
      if (bp.get(x + dx, 1, z + dz) !== BlockId.AIR) continue;
      previous.set(k, `${x},${z}`);
      queue.push([x + dx, z + dz]);
    }
  }
  const way: string[] = [];
  for (let k = goal; k; k = previous.get(k) ?? '') way.unshift(k);
  way.forEach((k, i) => {
    const [x, z] = k.split(',').map(Number);
    if (i >= 2 && i < way.length - 2 && i % 3 === 0) bp.set(x, 0, z, BlockId.HIDDEN_PLATE);
  });
  for (const [x, z] of queue) {
    if (!way.includes(`${x},${z}`) && rand() < 0.3) bp.set(x, 0, z, BlockId.HIDDEN_PLATE);
  }

  // 7. Treasure room over a shallow spike pit: opening the chest brings the floor down.
  box(B[0], B[1], -1, -1, M[0], M[1], BlockId.SPIKES);
  for (const [gx, gz] of [
    [-80, -19],
    [-80, -26],
    [-76, -19],
    [-76, -26],
  ]) {
    box(gx, gx, 1, 2, gz, gz, BlockId.GOLD);
  }
  const treasure = { x: -82, r: 1, z: -23 };

  // Secret room behind the hall's cracks.
  box(-68, -64, 0, 0, -13, -9, BlockId.GOLD);
  const secret = { x: -66, r: 1, z: -11 };

  const chests = { treasure, secret };
  for (const c of Object.values(chests)) bp.set(c.x, c.r, c.z, BlockId.CHEST);
  return { blueprint: bp, chests };
}
