import type * as THREE from 'three';
import { ItemId } from '../items/items';
import type { PlayerState, Vec3 } from '../player/Player';
import { BlockId } from '../world/blocks';
import { inZone, zone } from '../world/generation/blueprint';
import {
  ARROW_SHOOTERS,
  CITADEL_CHECKPOINTS,
  CITADEL_DOORS,
  CITADEL_ROOMS,
  CITADEL_ZONES,
  citadelLayout,
  GHOST_PATH,
  PLATFORM_GROUPS,
  WIND_VENTS,
  type CitadelChestId,
} from '../world/generation/citadel';
import type { World } from '../world/World';
import type { Loot } from './Castle';
import type { FortressEvents } from './Fortress';
import { Projectiles } from './Projectiles';
import { Crumbling, fillZone, Rhythm, underfoot, type Cell } from './traps';

export interface CitadelEvents extends FortressEvents {
  /** Damage from a trap (arrows, rocks), pushing the player away from `from`. */
  hurt(damage: number, from: Vec3, knockback: number): void;
}

type ZoneName = keyof typeof CITADEL_ZONES;

const LOOT: Record<CitadelChestId, Loot[]> = {
  secret: [
    { id: BlockId.GOLD, count: 8 },
    { id: BlockId.GLASS, count: 16 },
  ],
  treasure: [
    { id: ItemId.SPECTRAL_SWORD, count: 1 },
    { id: BlockId.GOLD, count: 16 },
  ],
};

const CRUMBLE = { delay: 0.6, restore: 5 };
/** Every launcher shoots once per period, at its own phase. */
const ARROWS = { period: 1.6, speed: 13, damage: 3 };
/** The ghost bridge shows itself for `shown` seconds every `period` (longer the first time). */
const GHOST = { period: 5, shown: 1.2, first: 2.5 };
const PLATFORMS = { period: 3, on: 2, offset: 1 };
/** Gusts: a warning puff from the vents, then a push for `gust` seconds; sides alternate. */
const WIND = { period: 3.4, warn: 0.7, gust: 1.1, force: 38 };
const ROCKS = { interval: 0.55, damage: 3, lead: 0.5, spread: 1.6 };
/** Hidden plates raise spikes around themselves after a click. */
const PLATE_TRAP = { delay: 0.25, duration: 1.5, cooldown: 2.5 };
/** The treasure room floor gives way column after column, from the chest to the exit. */
const COLLAPSE = { start: 0.8, step: 0.28, restore: 12 };
/** The moving traps only run while the player is close (each change remeshes a chunk). */
const NEAR = 6;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const near = (name: ZoneName) => {
  const z = CITADEL_ZONES[name];
  return zone(z.minX - NEAR, z.maxX + NEAR, -4, 9, z.minZ - NEAR, z.maxZ + NEAR);
};

interface PlateTrap {
  x: number;
  y: number;
  z: number;
  timer: number;
  state: 'clicked' | 'spiking' | 'resting';
  spikes: Cell[];
}

/**
 * The Cursed Citadel at runtime: no monsters, only traps. Arrows fly across a corridor,
 * an invisible bridge shows itself in flashes, platforms come and go, gusts sweep a narrow
 * bridge, rocks rain on crumbling slabs, a maze hides spike plates, and the treasure room
 * collapses behind the player.
 */
export class Citadel {
  private readonly entered = new Set<ZoneName>();
  private readonly chests = new Map<string, CitadelChestId>();
  private readonly crumbling: Crumbling;
  private readonly platforms: Rhythm;
  readonly projectiles: Projectiles;
  private time = 0;
  private ghostTime = 0;
  private ghostShown = false;
  private windTime = 0;
  private rockTimer = ROCKS.interval;
  private readonly plates = new Map<string, PlateTrap>();
  private collapse: { timer: number; column: number } | null = null;
  conquered = false;
  private escaped = false;

  constructor(
    private readonly world: World,
    readonly floorY: number,
    scene: THREE.Scene,
    private readonly events: CitadelEvents,
  ) {
    const chests = citadelLayout().chests;
    for (const id of Object.keys(chests) as CitadelChestId[]) {
      const c = chests[id];
      this.chests.set(key(c.x, floorY + c.r, c.z), id);
    }
    this.crumbling = new Crumbling(world, events.burst, CRUMBLE.delay, CRUMBLE.restore);
    const groups = PLATFORM_GROUPS.map((g) => g.map(([x, z]): Cell => [x, floorY, z]));
    this.platforms = new Rhythm(world, groups, PLATFORMS, BlockId.FLAGSTONE);
    this.projectiles = new Projectiles(scene);
  }

  contains(x: number, z: number): boolean {
    return citadelLayout().blueprint.contains(x, z);
  }

  canBuild(x: number, _y: number, z: number): boolean {
    return !this.contains(x, z);
  }

  update(dt: number, player: PlayerState): void {
    this.time += dt;
    const p = player.position;
    const x = Math.floor(p.x);
    const r = Math.floor(p.y) - this.floorY;
    const z = Math.floor(p.z);
    const at = (name: ZoneName) => inZone(near(name), x, r, z);
    for (const name of Object.keys(CITADEL_ZONES) as ZoneName[]) {
      if (this.entered.has(name) || !inZone(CITADEL_ZONES[name], x, r, z)) continue;
      this.entered.add(name);
      this.enter(name);
    }

    this.crumbling.update(dt, player);
    if (at('arrows')) this.shootArrows(dt);
    if (at('ghost')) this.updateGhost(dt);
    if (at('platforms')) this.platforms.update(dt);
    if (inZone(CITADEL_ZONES.wind, x, r, z)) this.updateWind(dt, player);
    if (inZone(CITADEL_ZONES.rocks, x, r, z)) this.updateRocks(dt, player);
    this.updatePlates(dt, player);
    this.updateCollapse(dt);
    this.projectiles.update(
      dt,
      (bx, by, bz) => this.world.isSolid(bx, by, bz),
      player,
      (damage, from) => this.events.hurt(damage, from, 0.6),
      (bx, by, bz, rock) => rock && this.events.burst(bx, by, bz, BlockId.COBBLESTONE),
    );

    if (this.conquered && !this.escaped && inZone(CITADEL_ZONES.hall, x, r, z)) {
      this.escaped = true;
      this.events.rumble(600, 0.7);
      this.events.announce(
        'Vous avez survécu à la Citadelle maudite !',
        'Aucun monstre, rien que des pièges… et vous les avez tous déjoués.',
        8,
      );
    }
  }

  openChest(x: number, y: number, z: number): Loot[] {
    const id = this.chests.get(key(x, y, z));
    this.world.setBlock(x, y, z, BlockId.AIR);
    this.events.burst(x, y, z, BlockId.CHEST);
    if (!id) return [];
    this.chests.delete(key(x, y, z));
    if (id === 'treasure') {
      this.conquered = true;
      fillZone(this.world, this.floorY, CITADEL_DOORS.escape, BlockId.AIR);
      this.collapse = { timer: COLLAPSE.start, column: CITADEL_ROOMS.B[0] };
      this.events.rumble(700, 0.9);
      this.events.announce('La citadelle s’effondre !', 'Fuyez vers la herse à l’est, vite !', 5);
    }
    return LOOT[id];
  }

  private enter(name: ZoneName): void {
    const say = (title: string, text: string) => this.events.announce(title, text);
    const checkpoint = CITADEL_CHECKPOINTS[name];
    if (checkpoint) {
      this.events.checkpoint({
        x: checkpoint.x + 0.5,
        y: this.floorY + checkpoint.r,
        z: checkpoint.z + 0.5,
      });
    }
    switch (name) {
      case 'approach':
        say(
          'La Citadelle maudite',
          'La plus redoutable des trois. Aucun monstre… rien que des pièges.',
        );
        break;
      case 'hall':
        say('Point de réapparition', 'Vous en aurez besoin. Le chemin commence au nord.');
        break;
      case 'arrows':
        say(
          'Épreuve 1 : le Couloir des flèches',
          'Observez le rythme des tirs. Sautez les flèches basses !',
        );
        break;
      case 'ghost':
        say(
          'Épreuve 2 : le Pont invisible',
          'Il n’apparaît que par instants. Mémorisez le chemin !',
        );
        this.ghostTime = 0;
        break;
      case 'platforms':
        say(
          'Épreuve 3 : les Dalles fantômes',
          'Elles vont et viennent. Sautez quand la suivante apparaît.',
        );
        break;
      case 'wind':
        say(
          'Épreuve 4 : le Pont des vents',
          'Quand les grilles soufflent, luttez contre le vent !',
        );
        break;
      case 'rocks':
        say(
          'Épreuve 5 : la Pluie de pierres',
          'Le plafond s’écroule et le sol s’effrite. Ne vous arrêtez pas.',
        );
        break;
      case 'maze':
        say(
          'Épreuve 6 : le Labyrinthe piégé',
          'Certaines dalles cachent un déclic… et des piques.',
        );
        break;
      case 'treasure':
        say('La salle du trésor', 'Prenez-le… si vous êtes prêt à courir.');
        break;
      case 'secret':
        say('Une salle secrète !', 'Même ici, il y avait de l’or caché.');
        break;
    }
  }

  private shootArrows(dt: number): void {
    const before = this.time - dt;
    for (const s of ARROW_SHOOTERS) {
      // Fires when the launcher's phase wraps around during this frame.
      const crossed =
        Math.floor((this.time - s.phase) / ARROWS.period) >
        Math.floor((before - s.phase) / ARROWS.period);
      if (!crossed) continue;
      const from = { x: s.x + 0.5, y: this.floorY + s.r + 0.5, z: s.z + 0.5 + s.dz * 0.75 };
      this.projectiles.fireArrow(from, { x: 0, y: 0, z: s.dz }, ARROWS.speed, ARROWS.damage);
    }
  }

  private updateGhost(dt: number): void {
    this.ghostTime += dt;
    const t = this.ghostTime;
    const shown = t < GHOST.first || (t - GHOST.first) % GHOST.period > GHOST.period - GHOST.shown;
    if (shown === this.ghostShown) return;
    this.ghostShown = shown;
    for (const [x, z] of GHOST_PATH) {
      this.world.setBlock(x, this.floorY, z, shown ? BlockId.GHOST_SHOWN : BlockId.GHOST);
    }
  }

  private updateWind(dt: number, player: PlayerState): void {
    const before = this.windTime;
    this.windTime += dt;
    const cycle = Math.floor(this.windTime / WIND.period);
    const phase = this.windTime % WIND.period;
    const direction = cycle % 2 === 0 ? 1 : -1; // +1 blows east, from the west vents
    if (Math.floor(before / WIND.period) !== cycle || before === 0) {
      const ventX = direction > 0 ? CITADEL_ROOMS.A[0] : CITADEL_ROOMS.A[1];
      for (const [r, z] of WIND_VENTS) this.events.burst(ventX, this.floorY + r, z, BlockId.SAND);
      this.events.notify(direction > 0 ? 'Rafale → !' : '← Rafale !');
    }
    if (phase >= WIND.warn && phase < WIND.warn + WIND.gust) {
      player.velocity.x += direction * WIND.force * dt;
    }
  }

  private updateRocks(dt: number, player: PlayerState): void {
    this.rockTimer -= dt;
    if (this.rockTimer > 0) return;
    this.rockTimer = ROCKS.interval;
    const p = player.position;
    const v = player.velocity;
    // Aimed where the player is heading, kept inside the room so no rock starts in a wall.
    const { A, S } = CITADEL_ROOMS;
    const clamp = (value: number, [min, max]: readonly [number, number]) =>
      Math.min(max + 0.7, Math.max(min + 0.3, value));
    const spread = () => (Math.random() - 0.5) * 2 * ROCKS.spread;
    const x = clamp(p.x + v.x * ROCKS.lead + spread(), A);
    const z = clamp(p.z + v.z * ROCKS.lead + spread(), S);
    const ceiling = this.floorY + 6;
    this.events.burst(Math.floor(x), ceiling, Math.floor(z), BlockId.CITADEL_STONE);
    this.projectiles.dropRock({ x, y: ceiling + 0.4, z }, ROCKS.damage);
  }

  private updatePlates(dt: number, player: PlayerState): void {
    underfoot(this.world, player, (id, x, y, z) => {
      if (id !== BlockId.HIDDEN_PLATE || this.plates.has(key(x, y, z))) return;
      this.plates.set(key(x, y, z), {
        x,
        y,
        z,
        timer: PLATE_TRAP.delay,
        state: 'clicked',
        spikes: [],
      });
      this.events.notify('Clic…');
    });
    for (const [k, plate] of this.plates) {
      plate.timer -= dt;
      if (plate.timer > 0) continue;
      if (plate.state === 'clicked') {
        // Spikes rise in every open cell around (and over) the plate.
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cell: Cell = [plate.x + dx, plate.y + 1, plate.z + dz];
            if (this.world.getBlock(...cell) !== BlockId.AIR) continue;
            this.world.setBlock(...cell, BlockId.SPIKES);
            plate.spikes.push(cell);
          }
        }
        plate.state = 'spiking';
        plate.timer = PLATE_TRAP.duration;
      } else if (plate.state === 'spiking') {
        for (const cell of plate.spikes) this.world.setBlock(...cell, BlockId.AIR);
        plate.spikes = [];
        plate.state = 'resting';
        plate.timer = PLATE_TRAP.cooldown;
      } else {
        this.plates.delete(k);
      }
    }
  }

  private updateCollapse(dt: number): void {
    const c = this.collapse;
    if (!c) return;
    c.timer -= dt;
    const { B, M } = CITADEL_ROOMS;
    while (c.timer <= 0 && c.column <= B[1]) {
      for (let z = M[0]; z <= M[1]; z++)
        this.crumbling.drop(c.column, this.floorY, z, COLLAPSE.restore);
      c.column++;
      c.timer += COLLAPSE.step;
    }
    if (c.column > B[1]) this.collapse = null;
  }
}
