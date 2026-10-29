import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Castle } from '../src/castle/Castle';
import { ItemId } from '../src/items/items';
import { MobManager } from '../src/mobs/MobManager';
import { stepPlayer } from '../src/player/Physics';
import { createPlayer } from '../src/player/Player';
import { BlockId } from '../src/world/blocks';
import {
  ARENA_CENTER,
  CASTLE,
  CASTLE_DOORS,
  CASTLE_ZONES,
  castleLayout,
} from '../src/world/generation/castle';
import { TerrainGenerator } from '../src/world/generation/TerrainGenerator';
import { World } from '../src/world/World';

const at = (x: number, r: number, z: number) => castleLayout().blueprint.get(x, r, z);

/** Cells a player can stand in at floor level (r = 1): air for feet and head. */
function reachable(from: [number, number]): Set<string> {
  const seen = new Set([from.join(',')]);
  const queue = [from];
  while (queue.length > 0) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < CASTLE.minX || nx > CASTLE.maxX || nz < CASTLE.minZ || nz > CASTLE.maxZ) continue;
      if (seen.has(`${nx},${nz}`) || at(nx, 1, nz) !== BlockId.AIR || at(nx, 2, nz) !== BlockId.AIR)
        continue;
      seen.add(`${nx},${nz}`);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

describe('castle layout', () => {
  it('places every chest on solid ground', () => {
    for (const c of Object.values(castleLayout().chests)) {
      expect(at(c.x, c.r, c.z)).toBe(BlockId.CHEST);
      expect(at(c.x, c.r - 1, c.z)).not.toBe(BlockId.AIR);
    }
  });

  it('has a maze that leads from the courtyard to the chasm', () => {
    const cells = reachable([0, -10]); // courtyard, behind the gate
    expect(cells.has('-18,-18')).toBe(true); // maze entrance
    expect(cells.has('1,-27')).toBe(true); // chasm start ledge, through the maze
    // The maze chest sits next to a reachable cell.
    const { x, z } = castleLayout().chests.maze;
    const around = [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`];
    expect(around.some((c) => cells.has(c))).toBe(true);
  });

  it('keeps the throne hall sealed until the arena is won', () => {
    const cells = reachable([0, -10]);
    expect(cells.has('-10,-40')).toBe(false);
    expect(at(0, 1, -34)).toBe(BlockId.PORTCULLIS);
    expect(at(-15, 1, -46)).toBe(BlockId.PORTCULLIS);
  });

  it('is stamped into the generated terrain', () => {
    const generator = new TerrainGenerator('castle-test');
    const floor = generator.castleFloor;
    const chunk = generator.generate(0, -1); // x 0…15, z −16…−1: gate and courtyard
    const gateTower = chunk.get(3, floor + 5, -5 + 16);
    expect(gateTower).toBe(BlockId.CASTLE_STONE);
    expect(chunk.get(0, floor + 1, -4 + 16)).toBe(BlockId.AIR); // the gate is open
  });
});

describe('castle chasm', () => {
  // Solid cells of the castle with the floor at y = 0 (so y = r).
  const isSolid = (x: number, y: number, z: number) =>
    x >= CASTLE.minX &&
    x <= CASTLE.maxX &&
    z >= CASTLE.minZ &&
    z <= CASTLE.maxZ &&
    y >= CASTLE.minR &&
    y <= CASTLE.maxR
      ? at(x, y, z) !== BlockId.AIR
      : false;

  /** Runs (sprinting) from platform to platform, jumping at the edge, like a player would. */
  it('can be crossed pillar by pillar', () => {
    const path: [number, number][] = [
      [4.5, -28.5],
      [6.5, -28.5],
      [8.5, -26.5],
      [8.5, -23.5],
      [10.5, -21.5],
      [13, -22],
      [16.5, -22.5],
      [16.5, -25.5],
      [18.5, -25.5],
    ];
    const body = createPlayer();
    body.position = { x: 2.5, y: 1, z: -28.5 };
    body.onGround = true;
    for (const [tx, tz] of path) {
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) {
        const dx = tx - body.position.x;
        const dz = tz - body.position.z;
        body.yaw = Math.atan2(-dx, -dz);
        const d = Math.hypot(dx, dz);
        const ahead = {
          x: body.position.x + (dx / d) * 0.35,
          z: body.position.z + (dz / d) * 0.35,
        };
        const edge = !isSolid(
          Math.floor(ahead.x),
          Math.floor(body.position.y) - 1,
          Math.floor(ahead.z),
        );
        stepPlayer(
          body,
          { forward: d > 0.2 ? 1 : 0, strafe: 0, jump: body.onGround && edge, shift: true },
          1 / 60,
          isSolid,
        );
        // On the target platform, not down in the pit.
        landed =
          body.onGround &&
          Math.hypot(tx - body.position.x, tz - body.position.z) < 0.9 &&
          body.position.y > 0.5;
      }
      expect(landed, `jump to ${tx}, ${tz}`).toBe(true);
    }
  });
});

describe('castle trials', () => {
  const setup = () => {
    const world = new World();
    const mobs = new MobManager(world, new THREE.Scene());
    const castle = new Castle(world, mobs, 70, {
      announce: () => {},
      notify: () => {},
      burst: () => {},
      rumble: () => {},
    });
    return { mobs, castle };
  };
  const inside = (zone: (typeof CASTLE_ZONES)[keyof typeof CASTLE_ZONES]) => ({
    x: zone.minX + 1.5,
    y: 70 + zone.minR + 0.0,
    z: zone.minZ + 1.5,
  });

  it('runs the arena waves and rewards the winner', () => {
    const { mobs, castle } = setup();
    const player = inside(CASTLE_ZONES.arena);
    for (let wave = 0; wave < 3; wave++) {
      for (let i = 0; i < 4 * 60; i++) castle.update(1 / 60, player);
      const alive = mobs.mobs.filter((m) => m.deathTimer === null);
      expect(alive.length).toBe(3);
      for (const m of alive) m.deathTimer = 0;
    }
    castle.update(1 / 60, player);
    const c = ARENA_CENTER;
    expect(castle.openChest(c.x, 70 + c.r, c.z).map((l) => l.id)).toContain(ItemId.STONE_SWORD);
  });

  it('wakes the guardian after the throne chest, and the castle is conquered when it falls', () => {
    const { mobs, castle } = setup();
    const t = castleLayout().chests.throne;
    expect(castle.openChest(t.x, 70 + t.r, t.z).map((l) => l.id)).toContain(ItemId.RUNE_SWORD);
    for (let i = 0; i < 120; i++) castle.update(1 / 60, inside(CASTLE_ZONES.hall));
    const guardian = mobs.mobs.find((m) => m.alwaysBurning);
    expect(guardian?.maxHealth).toBeGreaterThan(guardian?.type.health ?? 0);
    guardian!.deathTimer = 0;
    castle.update(1 / 60, inside(CASTLE_ZONES.hall));
    expect(castle.conquered).toBe(true);
  });

  it('forbids building in the trial rooms but not in the courtyard', () => {
    const { castle } = setup();
    expect(castle.canBuild(5, 72, -25)).toBe(false);
    expect(castle.canBuild(5, 72, -10)).toBe(true);
    expect(castle.canBuild(60, 72, 60)).toBe(true);
    expect(CASTLE_DOORS.arenaEntrance.minZ).toBe(-32);
  });
});
