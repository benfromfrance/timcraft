import { describe, expect, it } from 'vitest';
import { stepPlayer, type MoveInput } from '../src/player/Physics';
import { createPlayer } from '../src/player/Player';
import { raycast, rayBox } from '../src/player/Raycast';

const idle: MoveInput = { forward: 0, strafe: 0, jump: false, shift: false };
const floorAt64 = (_x: number, y: number) => y < 64;

describe('stepPlayer', () => {
  it('falls and lands on the ground', () => {
    const p = createPlayer();
    p.position.y = 70;
    for (let i = 0; i < 120; i++) stepPlayer(p, idle, 1 / 60, floorAt64);
    expect(p.onGround).toBe(true);
    expect(p.position.y).toBeCloseTo(64, 3);
    expect(p.velocity.y).toBe(0);
  });

  it('is stopped by a wall', () => {
    const p = createPlayer();
    p.position = { x: 0.5, y: 64, z: 0.5 };
    const wall = (x: number, y: number) => y < 64 || x >= 3;
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, { ...idle, strafe: 1 }, 1 / 60, wall); // yaw 0: strafe right = +X
    }
    expect(p.position.x).toBeCloseTo(3 - 0.3, 3);
  });

  it('reports being blocked by a wall', () => {
    const p = createPlayer();
    p.position = { x: 0.5, y: 64, z: 0.5 };
    const wall = (_x: number, y: number, z: number) => y < 64 || z <= -2;
    let blocked = false;
    for (let i = 0; i < 60; i++) blocked = stepPlayer(p, { ...idle, forward: 1 }, 1 / 60, wall);
    expect(blocked).toBe(true);
  });

  it('can jump onto a one-block step', () => {
    const p = createPlayer();
    p.position = { x: 0.5, y: 64, z: 0.5 };
    const step = (x: number, y: number) => y < 64 || (x >= 2 && y < 65);
    for (let i = 0; i < 120; i++) stepPlayer(p, { ...idle, strafe: 1, jump: true }, 1 / 60, step);
    expect(p.position.x).toBeGreaterThan(2);
    expect(p.position.y).toBeGreaterThanOrEqual(65);
  });
});

describe('raycast', () => {
  it('finds the first solid block and the face normal', () => {
    const hit = raycast({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 10, (x, y, z) =>
      x === 0 && y === 0 && z === -5,
    );
    expect(hit).toMatchObject({ x: 0, y: 0, z: -5, nx: 0, ny: 0, nz: 1 });
    expect(hit?.distance).toBeCloseTo(4.5);
  });

  it('returns null beyond max distance', () => {
    const hit = raycast({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 3, (x) => x === 10);
    expect(hit).toBeNull();
  });

  it('works with negative coordinates and diagonal rays', () => {
    const d = Math.SQRT1_2;
    const hit = raycast({ x: -0.5, y: 5.5, z: -0.5 }, { x: -d, y: -d, z: 0 }, 10, (_x, y) => y < 3);
    expect(hit?.y).toBe(2);
    expect(hit?.ny).toBe(1);
  });
});

describe('rayBox', () => {
  const box = { min: { x: -0.3, y: 0, z: -5.3 }, max: { x: 0.3, y: 1.9, z: -4.7 } };

  it('hits a box in front', () => {
    const t = rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box.min, box.max, 10);
    expect(t).toBeCloseTo(4.7);
  });

  it('misses beside or beyond reach', () => {
    expect(rayBox({ x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box.min, box.max, 10)).toBeNull();
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box.min, box.max, 3)).toBeNull();
    expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, box.min, box.max, 10)).toBeNull();
  });
});
