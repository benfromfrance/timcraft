import { describe, expect, it } from 'vitest';
import { createBrain, DEFAULT_BEHAVIOR, think, turnToward } from '../src/mobs/mobAI';
import { MOB_TYPES, pickMobType } from '../src/mobs/mobTypes';
import { stepPlayer } from '../src/player/Physics';
import { createPlayer } from '../src/player/Player';

const flat = (_x: number, y: number) => y < 64;
const noRandom = () => 0.5;

function mobAt(x: number, z: number) {
  const body = createPlayer();
  body.position = { x, y: 64, z };
  body.onGround = true;
  return body;
}

describe('turnToward', () => {
  it('takes the short way round and respects the max step', () => {
    expect(turnToward(0, 0.5, 1)).toBeCloseTo(0.5);
    expect(turnToward(0, 2, 1)).toBeCloseTo(1);
    expect(turnToward(3, -3, 10)).toBeCloseTo(3 + (2 * Math.PI - 6)); // across ±π
  });
});

describe('think', () => {
  it('walks toward a nearby target until close', () => {
    const body = mobAt(0.5, 0.5);
    const brain = createBrain();
    const target = { x: 0.5, y: 64, z: -8 };
    for (let i = 0; i < 600; i++) {
      const move = think(body, brain, target, false, 1 / 60, noRandom);
      stepPlayer(body, move, 1 / 60, flat);
    }
    expect(Math.hypot(body.position.x - target.x, body.position.z - target.z)).toBeLessThan(1.2);
  });

  it('ignores a target out of range', () => {
    const body = mobAt(0, 0);
    const brain = createBrain();
    const target = { x: DEFAULT_BEHAVIOR.chaseRange + 5, y: 64, z: 0 };
    const startYaw = body.yaw;
    const move = think(body, brain, target, false, 1 / 60, () => 0.99);
    expect(move.forward).toBe(0); // rand 0.99 ⇒ idle, not chasing
    expect(body.yaw).toBeCloseTo(startYaw, 0);
  });

  it('jumps when blocked while chasing', () => {
    const body = mobAt(0, 0);
    const move = think(body, createBrain(), { x: 0, y: 64, z: -5 }, true, 1 / 60, noRandom);
    expect(move.jump).toBe(true);
  });
});

describe('mob types', () => {
  it('have distinct ids and sane stats', () => {
    expect(new Set(MOB_TYPES.map((t) => t.id)).size).toBe(MOB_TYPES.length);
    for (const t of MOB_TYPES) {
      expect(t.health).toBeGreaterThan(0);
      expect(t.size.width).toBeLessThanOrEqual(1.5);
    }
  });

  it('spawns brutes more often at night', () => {
    const count = (night: boolean) => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (pickMobType(night, () => (i + 0.5) / 1000).id === 'brute') n++;
      return n;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});
