import { playerIntersectsBlock, type PlayerState } from '../player/Player';
import { BlockId } from '../world/blocks';
import type { CastleZone } from '../world/generation/blueprint';
import type { World } from '../world/World';

// Trap mechanisms shared by the buildings (Fortress, Citadel). Pure game logic on world blocks.

export type Cell = readonly [number, number, number];

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Sets every block of a zone (doors, portcullises), with heights relative to `floorY`. */
export function fillZone(world: World, floorY: number, zone: CastleZone, id: number): void {
  for (let r = zone.minR; r <= zone.maxR; r++) {
    for (let z = zone.minZ; z <= zone.maxZ; z++) {
      for (let x = zone.minX; x <= zone.maxX; x++) world.setBlock(x, floorY + r, z, id);
    }
  }
}

/** True if the player's body overlaps any block of the zone. */
export function playerInZone(player: PlayerState, floorY: number, zone: CastleZone): boolean {
  for (let r = zone.minR; r <= zone.maxR; r++) {
    for (let z = zone.minZ; z <= zone.maxZ; z++) {
      for (let x = zone.minX; x <= zone.maxX; x++) {
        if (playerIntersectsBlock(player, x, floorY + r, z)) return true;
      }
    }
  }
  return false;
}

/** Calls `visit` for each distinct block under the four corners of a grounded player's feet. */
export function underfoot(
  world: World,
  player: PlayerState,
  visit: (id: number, x: number, y: number, z: number) => void,
): void {
  if (!player.onGround) return;
  const p = player.position;
  const y = Math.floor(p.y - 0.05);
  const seen = new Set<string>();
  for (const dx of [-0.29, 0.29]) {
    for (const dz of [-0.29, 0.29]) {
      const x = Math.floor(p.x + dx);
      const z = Math.floor(p.z + dz);
      if (seen.has(cellKey(x, y, z))) continue;
      seen.add(cellKey(x, y, z));
      visit(world.getBlock(x, y, z), x, y, z);
    }
  }
}

interface Timed {
  x: number;
  y: number;
  z: number;
  timer: number;
  /** Block put back once the timer runs out. */
  id: number;
}

/** Slabs that give way a moment after being stepped on, and come back later. */
export class Crumbling {
  private readonly cracking = new Map<string, Timed>();
  private readonly fallen = new Map<string, Timed>();

  constructor(
    private readonly world: World,
    private readonly burst: (x: number, y: number, z: number, id: number) => void,
    private readonly delay: number,
    private readonly restore: number,
    private readonly id: number = BlockId.CRUMBLE,
  ) {}

  update(dt: number, player: PlayerState): void {
    underfoot(this.world, player, (id, x, y, z) => {
      const k = cellKey(x, y, z);
      if (id === this.id && !this.cracking.has(k))
        this.cracking.set(k, { x, y, z, timer: this.delay, id });
    });
    for (const [k, slab] of this.cracking) {
      slab.timer -= dt;
      if (slab.timer > 0) continue;
      this.cracking.delete(k);
      this.drop(slab.x, slab.y, slab.z, this.restore);
    }
    for (const [k, slab] of this.fallen) {
      slab.timer -= dt;
      if (slab.timer > 0 || playerIntersectsBlock(player, slab.x, slab.y, slab.z)) continue;
      this.fallen.delete(k);
      this.world.setBlock(slab.x, slab.y, slab.z, slab.id);
    }
  }

  /** Makes a block fall now (a collapse); it comes back after `restore` seconds. */
  drop(x: number, y: number, z: number, restore: number): void {
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.AIR) return;
    this.world.setBlock(x, y, z, BlockId.AIR);
    this.burst(x, y, z, id);
    this.fallen.set(cellKey(x, y, z), { x, y, z, timer: restore, id });
  }
}

/**
 * Groups of cells switching between two blocks in turn (spikes rising, platforms appearing).
 * Group g is "on" while ((t − g·offset) mod period) < on. The blueprint starts them all on.
 */
export class Rhythm {
  private time = 0;
  private readonly state: boolean[];

  constructor(
    private readonly world: World,
    private readonly groups: readonly (readonly Cell[])[],
    private readonly timing: { period: number; on: number; offset: number },
    private readonly onId: number,
    private readonly offId: number = BlockId.AIR,
  ) {
    this.state = groups.map(() => true);
  }

  isOn(group: number): boolean {
    return this.state[group];
  }

  update(dt: number): void {
    this.time += dt;
    const { period, on, offset } = this.timing;
    this.groups.forEach((cells, g) => {
      const phase = (((this.time - g * offset) % period) + period) % period;
      const now = phase < on;
      if (now === this.state[g]) return;
      this.state[g] = now;
      for (const [x, y, z] of cells) this.world.setBlock(x, y, z, now ? this.onId : this.offId);
    });
  }
}
