import * as THREE from 'three';
import type { BodySize } from '../player/Physics';
import { MobModel } from './MobModel';

export interface MobType {
  id: 'lurker' | 'leaper' | 'brute';
  name: string;
  size: BodySize;
  health: number;
  /** In half-hearts. */
  damage: number;
  /** Centre-to-centre distance at which it can strike. */
  attackRange: number;
  attackCooldown: number;
  /** Fractions of the player's walking speed. */
  chaseSpeed: number;
  wanderSpeed: number;
  chaseRange: number;
  /** 0 takes full knockback … 1 does not budge. */
  knockbackResist: number;
  /** Multiplier on the knockback it deals to the player. */
  knockbackDealt: number;
  /** Lunges at its target from a few blocks away. */
  leaps: boolean;
  /** Relative spawn chances. */
  spawnWeight: { day: number; night: number };
  createModel(): MobModel;
}

/** Rôdeur: a shadow humanoid with glowing eyes. The all-rounder. */
function buildLurker(): MobModel {
  const m = new MobModel();
  const limbs = 0x2e2745;
  m.leg(m.limb([0.24, 0.75, 0.24], limbs, [-0.13, 0.75, 0]), 0);
  m.leg(m.limb([0.24, 0.75, 0.24], limbs, [0.13, 0.75, 0]), Math.PI);
  m.arms.push(m.limb([0.2, 0.7, 0.2], limbs, [-0.37, 1.44, 0]), m.limb([0.2, 0.7, 0.2], limbs, [0.37, 1.44, 0]));
  m.part([0.52, 0.72, 0.3], 0x4b3f6b, [0, 1.11, 0]);
  m.part([0.46, 0.46, 0.46], 0x5a4d80, [0, 1.7, 0]);
  for (const x of [-0.1, 0.1]) m.eye([0.1, 0.06, 0.02], 0xd8ff5a, [x, 1.74, -0.235]);
  m.addFlames(0.6, 1.9);
  return m;
}

/** Bondisseur: a low six-legged beetle that rushes and pounces. Fast, fragile. */
function buildLeaper(): MobModel {
  const m = new MobModel();
  m.legSwing = 0.55;
  const legs = 0x232a18;
  // Tripod gait: front and back legs of one side move with the middle leg of the other.
  [-0.32, 0, 0.32].forEach((z, i) => {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.34, 0.42, z);
      const splay = m.limb([0.07, 0.72, 0.07], legs, [0, 0, 0], hip);
      splay.rotation.z = side * 0.95; // legs reach outward and down
      m.root.add(hip);
      m.leg(hip, (i % 2 === 0) === (side > 0) ? 0 : Math.PI);
    }
  });
  const body = new THREE.Group();
  body.position.y = 0.42;
  m.tilt = body;
  m.root.add(body);
  m.part([0.72, 0.3, 0.9], 0x3d4a2a, [0, 0.05, 0.05], body);
  m.part([0.6, 0.12, 0.7], 0x55663a, [0, 0.24, 0.08], body); // shell ridge
  m.part([0.42, 0.26, 0.3], 0x2f3a20, [0, 0.02, -0.52], body);
  for (const x of [-0.12, 0.12]) m.part([0.05, 0.05, 0.16], 0x1a1f10, [x, -0.06, -0.72], body); // mandibles
  for (const x of [-0.14, -0.05, 0.05, 0.14]) m.eye([0.05, 0.05, 0.02], 0xffc23a, [x, 0.08, -0.675], body);
  m.addFlames(0.9, 0.75);
  return m;
}

/** Colosse: a hulking moss-covered stone golem. Slow, tough, hits very hard. */
function buildBrute(): MobModel {
  const m = new MobModel();
  m.legSwing = 0.45;
  const stone = 0x6b6f5e;
  const dark = 0x555a49;
  const moss = 0x5b8a3a;
  m.leg(m.limb([0.4, 0.95, 0.4], dark, [-0.27, 0.95, 0]), 0);
  m.leg(m.limb([0.4, 0.95, 0.4], dark, [0.27, 0.95, 0]), Math.PI);
  m.arms.push(m.limb([0.34, 1.25, 0.34], dark, [-0.7, 1.9, 0]), m.limb([0.34, 1.25, 0.34], dark, [0.7, 1.9, 0]));
  m.part([1.0, 1.0, 0.62], stone, [0, 1.45, 0]);
  m.part([0.55, 0.5, 0.55], stone, [0, 2.2, -0.04]);
  m.part([0.4, 0.12, 0.36], moss, [-0.28, 1.98, 0.02]);
  m.part([0.3, 0.1, 0.3], moss, [0.32, 1.98, -0.04]);
  m.part([0.4, 0.08, 0.4], moss, [0.02, 2.48, -0.02]);
  for (const x of [-0.13, 0.13]) m.eye([0.12, 0.07, 0.02], 0x7fe6ff, [x, 2.24, -0.325]);
  m.addFlames(1.2, 2.5);
  return m;
}

export const MOB_TYPES: readonly MobType[] = [
  {
    id: 'lurker',
    name: 'Rôdeur',
    size: { width: 0.6, height: 1.9 },
    health: 20,
    damage: 3,
    attackRange: 1.3,
    attackCooldown: 1,
    chaseSpeed: 0.75,
    wanderSpeed: 0.3,
    chaseRange: 16,
    knockbackResist: 0,
    knockbackDealt: 1,
    leaps: false,
    spawnWeight: { day: 3, night: 3 },
    createModel: buildLurker,
  },
  {
    id: 'leaper',
    name: 'Bondisseur',
    size: { width: 0.9, height: 0.75 },
    health: 10,
    damage: 2,
    attackRange: 1.2,
    attackCooldown: 0.8,
    chaseSpeed: 0.95,
    wanderSpeed: 0.45,
    chaseRange: 14,
    knockbackResist: 0,
    knockbackDealt: 0.6,
    leaps: true,
    spawnWeight: { day: 2, night: 2 },
    createModel: buildLeaper,
  },
  {
    id: 'brute',
    name: 'Colosse',
    size: { width: 1.2, height: 2.5 },
    health: 45,
    damage: 6,
    attackRange: 1.9,
    attackCooldown: 1.6,
    chaseSpeed: 0.45,
    wanderSpeed: 0.2,
    chaseRange: 18,
    knockbackResist: 0.8,
    knockbackDealt: 1.8,
    leaps: false,
    spawnWeight: { day: 0.4, night: 1.5 },
    createModel: buildBrute,
  },
];

/** Weighted random pick for the current time of day. */
export function pickMobType(night: boolean, rand: () => number): MobType {
  const weight = (t: MobType) => (night ? t.spawnWeight.night : t.spawnWeight.day);
  let roll = rand() * MOB_TYPES.reduce((sum, t) => sum + weight(t), 0);
  for (const type of MOB_TYPES) {
    roll -= weight(type);
    if (roll < 0) return type;
  }
  return MOB_TYPES[0];
}
