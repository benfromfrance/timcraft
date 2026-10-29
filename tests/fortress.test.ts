import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Fortress } from '../src/castle/Fortress';
import { ItemId } from '../src/items/items';
import { MobManager } from '../src/mobs/MobManager';
import { stepPlayer } from '../src/player/Physics';
import { createPlayer, type PlayerState } from '../src/player/Player';
import { BlockId } from '../src/world/blocks';
import { CASTLE } from '../src/world/generation/castle';
import {
  FORTRESS,
  FORTRESS_DOORS,
  FORTRESS_ZONES,
  fortressLayout,
  RHYTHM_GROUPS,
} from '../src/world/generation/fortress';
import { TerrainGenerator } from '../src/world/generation/TerrainGenerator';
import { World } from '../src/world/World';

const at = (x: number, r: number, z: number) => fortressLayout().blueprint.get(x, r, z);

describe('fortress layout', () => {
  it('stands apart from the first castle (their levelled grounds do not overlap)', () => {
    expect(FORTRESS.minX - FORTRESS.flat - FORTRESS.blend).toBeGreaterThan(
      CASTLE.maxX + CASTLE.flat + CASTLE.blend,
    );
  });

  it('places every chest on solid ground', () => {
    for (const c of Object.values(fortressLayout().chests)) {
      expect(at(c.x, c.r, c.z)).toBe(BlockId.CHEST);
      expect(at(c.x, c.r - 1, c.z)).not.toBe(BlockId.AIR);
    }
  });

  it('marks the golden path with gold in the ceiling, every other slab crumbles over spikes', () => {
    const path = new Set(fortressLayout().goldenPath.map(([x, z]) => `${x},${z}`));
    for (const [x, z] of fortressLayout().goldenPath) {
      expect(at(x, 0, z)).toBe(BlockId.FLAGSTONE);
      expect(at(x, 6, z)).toBe(BlockId.GOLD);
    }
    for (let z = -37; z <= -30; z++) {
      for (let x = 60; x <= 69; x++) {
        if (path.has(`${x},${z}`)) continue;
        expect(at(x, 0, z)).toBe(BlockId.CRUMBLE);
        expect(at(x, -2, z)).toBe(BlockId.SPIKES);
      }
    }
  });

  it('has a fragile bridge that can be crossed slab by slab', () => {
    const isSolid = (x: number, y: number, z: number) =>
      fortressLayout().blueprint.contains(x, z) && y >= FORTRESS.minR && y <= FORTRESS.maxR
        ? at(x, y, z) !== BlockId.AIR && at(x, y, z) !== BlockId.SPIKES
        : false;
    const path: [number, number][] = [
      [90.5, -12.5],
      [92.5, -10.5],
      [90.5, -7.5],
      [87.5, -7.5],
      [85.5, -9.5],
      [85.5, -12.5],
      [83.5, -12.5],
    ];
    const body = createPlayer();
    body.position = { x: 90.5, y: 1, z: -15.5 };
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
        const below = Math.floor(body.position.y) - 1;
        const edge = !isSolid(Math.floor(ahead.x), below, Math.floor(ahead.z));
        const jump = body.onGround && edge;
        stepPlayer(
          body,
          { forward: d > 0.2 ? 1 : 0, strafe: 0, jump, shift: true },
          1 / 60,
          isSolid,
        );
        landed = body.onGround && d < 0.9 && body.position.y > 0.5;
      }
      expect(landed, `jump to ${tx}, ${tz}`).toBe(true);
    }
  });
});

describe('fortress traps', () => {
  const generator = new TerrainGenerator('fortress-test');
  const floor = generator.fortressFloor;
  const setup = () => {
    const world = new World();
    for (let cz = -3; cz <= -1; cz++)
      for (let cx = 3; cx <= 5; cx++) world.addChunk(generator.generate(cx, cz));
    const mobs = new MobManager(world, new THREE.Scene());
    const checkpoints: { x: number; z: number }[] = [];
    const fortress = new Fortress(world, mobs, floor, {
      announce: () => {},
      notify: () => {},
      burst: () => {},
      rumble: () => {},
      checkpoint: (p) => checkpoints.push(p),
    });
    return { world, mobs, fortress, checkpoints };
  };
  const standAt = (x: number, r: number, z: number): PlayerState => {
    const p = createPlayer();
    p.position = { x: x + 0.5, y: floor + r, z: z + 0.5 };
    p.onGround = true;
    return p;
  };
  const run = (fortress: Fortress, player: PlayerState, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) fortress.update(1 / 60, player);
  };

  it('sets a checkpoint in the hall', () => {
    const { fortress, checkpoints } = setup();
    run(fortress, standAt(61, 1, -22), 0.1);
    expect(checkpoints).toHaveLength(1);
  });

  it('crumbles slabs a moment after they are stepped on, and brings them back', () => {
    const { world, fortress } = setup();
    const player = standAt(60, 1, -32); // on a crumbling slab of the golden path room
    run(fortress, player, 0.3);
    expect(world.getBlock(60, floor, -32)).toBe(BlockId.CRUMBLE);
    run(fortress, player, 0.5);
    expect(world.getBlock(60, floor, -32)).toBe(BlockId.AIR);
    run(fortress, standAt(64, 1, -29), 6); // back on the safe row
    expect(world.getBlock(60, floor, -32)).toBe(BlockId.CRUMBLE);
  });

  it('raises the rhythm spikes group after group', () => {
    const { world, fortress } = setup();
    const player = standAt(71, 1, -33);
    const states = new Set<string>();
    for (let i = 0; i < 6; i++) {
      run(fortress, player, 0.4);
      states.add(RHYTHM_GROUPS.map((g) => world.getBlock(g[0], floor, -33)).join());
    }
    expect(states.size).toBeGreaterThan(2);
    expect(world.getBlock(74, floor, -33)).toBe(BlockId.AIR); // refuges never spike
  });

  it('opens the race portcullis from the plate, for a few seconds only', () => {
    const { world, fortress } = setup();
    const door = FORTRESS_DOORS.raceExit;
    run(fortress, standAt(90, 1, -26), 0.1);
    expect(world.getBlock(door.minX, floor + 1, door.minZ)).toBe(BlockId.AIR);
    run(fortress, standAt(92, 1, -27), 6);
    expect(world.getBlock(door.minX, floor + 1, door.minZ)).toBe(BlockId.PORTCULLIS);
  });

  it('springs the false chest: spikes and a single monster', () => {
    const { world, mobs, fortress } = setup();
    const c = fortressLayout().chests.mimic;
    fortress.openChest(c.x, floor + c.r, c.z);
    expect(world.getBlock(86, floor, -33)).toBe(BlockId.SPIKES);
    expect(mobs.mobs).toHaveLength(1);
  });

  it('has a lone guardian whose fall opens the treasure room, whose chest wins the fortress', () => {
    const { world, mobs, fortress } = setup();
    const room = FORTRESS_ZONES.guardian;
    const player = standAt(81, 1, -12);
    expect(room.minX <= 81 && room.maxX >= 81).toBe(true);
    run(fortress, player, 0.1);
    expect(mobs.mobs).toHaveLength(1);
    mobs.mobs[0].deathTimer = 0;
    run(fortress, player, 0.1);
    expect(world.getBlock(76, floor + 1, -17)).toBe(BlockId.AIR);
    const t = fortressLayout().chests.treasure;
    expect(fortress.openChest(t.x, floor + t.r, t.z).map((l) => l.id)).toContain(ItemId.RUNE_AXE);
    expect(fortress.conquered).toBe(true);
    expect(world.getBlock(70, floor + 1, -22)).toBe(BlockId.AIR); // shortcut back to the hall
  });

  it('forbids building anywhere in the fortress', () => {
    const { fortress } = setup();
    expect(fortress.canBuild(76, floor + 1, -22)).toBe(false);
    expect(fortress.canBuild(40, floor + 1, -22)).toBe(true);
  });
});
