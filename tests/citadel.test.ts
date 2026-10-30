import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Citadel } from '../src/castle/Citadel';
import { ItemId } from '../src/items/items';
import { stepPlayer } from '../src/player/Physics';
import { createPlayer, type PlayerState } from '../src/player/Player';
import { BlockId } from '../src/world/blocks';
import { CASTLE } from '../src/world/generation/castle';
import {
  ARROW_SHOOTERS,
  CITADEL,
  CITADEL_DOORS,
  citadelLayout,
  GHOST_PATH,
  PLATFORM_GROUPS,
  WIND_PATH,
} from '../src/world/generation/citadel';
import { TerrainGenerator } from '../src/world/generation/TerrainGenerator';
import { World } from '../src/world/World';

const at = (x: number, r: number, z: number) => citadelLayout().blueprint.get(x, r, z);
const adjacent = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

describe('citadel layout', () => {
  it('stands apart from the first castle, on the other side', () => {
    expect(CITADEL.maxX + CITADEL.flat + CITADEL.blend).toBeLessThan(
      CASTLE.minX - CASTLE.flat - CASTLE.blend,
    );
  });

  it('places every chest on solid ground', () => {
    for (const c of Object.values(citadelLayout().chests)) {
      expect(at(c.x, c.r, c.z)).toBe(BlockId.CHEST);
      expect(at(c.x, c.r - 1, c.z)).not.toBe(BlockId.AIR);
    }
  });

  it('has an unbroken invisible bridge over spikes, and an unbroken wind bridge', () => {
    for (const path of [GHOST_PATH, WIND_PATH]) {
      for (let i = 1; i < path.length; i++) expect(adjacent(path[i - 1], path[i])).toBe(true);
    }
    for (const [x, z] of GHOST_PATH) {
      expect(at(x, 0, z)).toBe(BlockId.GHOST);
      expect(at(x, -2, z)).toBe(BlockId.SPIKES);
    }
  });

  it('puts the arrow launchers in the corridor walls, facing the corridor', () => {
    for (const s of ARROW_SHOOTERS) {
      expect(at(s.x, s.r, s.z)).toBe(BlockId.ARROW_TRAP);
      expect(at(s.x, s.r, s.z + s.dz)).toBe(BlockId.AIR);
    }
  });

  it('hides pressure plates along the way through the maze', () => {
    let plates = 0;
    for (let z = -16; z <= -7; z++)
      for (let x = -83; x <= -73; x++) if (at(x, 0, z) === BlockId.HIDDEN_PLATE) plates++;
    expect(plates).toBeGreaterThanOrEqual(3);
  });

  it('has platforms within jumping reach of each other', () => {
    const isSolid = (x: number, y: number, z: number) =>
      citadelLayout().blueprint.contains(x, z) && y >= CITADEL.minR && y <= CITADEL.maxR
        ? ![BlockId.AIR, BlockId.SPIKES].includes(at(x, y, z) as 0)
        : false;
    const path = [...PLATFORM_GROUPS.flat(), [-94, -30] as [number, number]].map(([x, z]) => [
      x + 0.5,
      z + 0.5,
    ]);
    const body = createPlayer();
    body.position = { x: -84.5, y: 1, z: -29.5 };
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
        landed = body.onGround && d < 0.9 && body.position.y > 0.5;
      }
      expect(landed, `jump to ${tx}, ${tz}`).toBe(true);
    }
  });
});

describe('citadel traps', () => {
  const generator = new TerrainGenerator('citadel-test');
  const floor = generator.citadelFloor;
  const setup = () => {
    const world = new World();
    for (let cz = -3; cz <= -1; cz++)
      for (let cx = -6; cx <= -4; cx++) world.addChunk(generator.generate(cx, cz));
    const hurts: number[] = [];
    const citadel = new Citadel(world, floor, new THREE.Scene(), {
      announce: () => {},
      notify: () => {},
      burst: () => {},
      rumble: () => {},
      checkpoint: () => {},
      hurt: (damage) => hurts.push(damage),
    });
    return { world, citadel, hurts };
  };
  const standAt = (x: number, r: number, z: number): PlayerState => {
    const p = createPlayer();
    p.position = { x: x + 0.5, y: floor + r, z: z + 0.5 };
    p.onGround = true;
    return p;
  };
  const run = (citadel: Citadel, player: PlayerState, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) citadel.update(1 / 60, player);
  };

  it('shoots arrows across the corridor', () => {
    const { citadel, hurts } = setup();
    run(citadel, standAt(-66, 1, -34), 2);
    expect(hurts.length).toBeGreaterThan(0);
  });

  it('shows the invisible bridge in flashes', () => {
    const { world, citadel } = setup();
    const [x, z] = GHOST_PATH[5];
    const player = standAt(-73, 1, -33);
    run(citadel, player, 0.5);
    expect(world.getBlock(x, floor, z)).toBe(BlockId.GHOST_SHOWN);
    run(citadel, player, 2.5);
    expect(world.getBlock(x, floor, z)).toBe(BlockId.GHOST);
  });

  it('makes the platforms come and go', () => {
    const { world, citadel } = setup();
    const [x, z] = PLATFORM_GROUPS[0][0];
    const seen = new Set<number>();
    const player = standAt(-85, 1, -30);
    for (let i = 0; i < 8; i++) {
      run(citadel, player, 0.5);
      seen.add(world.getBlock(x, floor, z));
    }
    expect(seen).toEqual(new Set([BlockId.FLAGSTONE, BlockId.AIR]));
  });

  it('blows the player off balance on the wind bridge', () => {
    const { citadel } = setup();
    const player = standAt(-90, 1, -24);
    let pushed = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      citadel.update(1 / 60, player);
      pushed = Math.max(pushed, Math.abs(player.velocity.x));
    }
    expect(pushed).toBeGreaterThan(1);
  });

  it('drops rocks in the rock room', () => {
    const { citadel } = setup();
    run(citadel, standAt(-90, 1, -16), 0.7);
    expect(citadel.projectiles.active).toBeGreaterThan(0);
  });

  it('raises spikes around a hidden plate, then lowers them', () => {
    const { world, citadel } = setup();
    let plate: [number, number] | null = null;
    for (let z = -16; z <= -7 && !plate; z++) {
      for (let x = -83; x <= -73 && !plate; x++)
        if (at(x, 0, z) === BlockId.HIDDEN_PLATE) plate = [x, z];
    }
    const [px, pz] = plate!;
    const player = standAt(px, 1, pz);
    run(citadel, player, 0.4);
    expect(world.getBlock(px, floor + 1, pz)).toBe(BlockId.SPIKES);
    run(citadel, standAt(-83, 1, -8), 2);
    expect(world.getBlock(px, floor + 1, pz)).toBe(BlockId.AIR);
  });

  it('collapses the treasure room behind the player, who wins by escaping', () => {
    const { world, citadel } = setup();
    const t = citadelLayout().chests.treasure;
    expect(citadel.openChest(t.x, floor + t.r, t.z).map((l) => l.id)).toContain(
      ItemId.SPECTRAL_SWORD,
    );
    expect(world.getBlock(CITADEL_DOORS.escape.minX, floor + 1, -22)).toBe(BlockId.AIR);
    run(citadel, standAt(-73, 1, -22), 1.5);
    expect(world.getBlock(-83, floor, -22)).toBe(BlockId.AIR);
    expect(world.getBlock(-73, floor, -22)).toBe(BlockId.FLAGSTONE); // not reached yet
    run(citadel, standAt(-63, 1, -22), 0.1);
    expect(citadel.conquered).toBe(true);
  });
});
