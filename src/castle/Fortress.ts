import { ItemId } from '../items/items';
import type { Mob, MobManager } from '../mobs/MobManager';
import { MOB_TYPES, type MobType } from '../mobs/mobTypes';
import type { PlayerState, Vec3 } from '../player/Player';
import { BlockId } from '../world/blocks';
import { inZone, zone, type CastlePos, type CastleZone } from '../world/generation/blueprint';
import {
  CHECKPOINTS,
  FORTRESS_DOORS,
  FORTRESS_ZONES,
  fortressLayout,
  GUARDIAN_SPAWN,
  MIMIC_FLOOR,
  MIMIC_SPAWN,
  RHYTHM_GROUPS,
  RHYTHM_Z,
  type FortressChestId,
} from '../world/generation/fortress';
import type { World } from '../world/World';
import type { CastleEvents, Loot } from './Castle';
import { Crumbling, fillZone, playerInZone, Rhythm, underfoot, type Cell } from './traps';

export interface FortressEvents extends CastleEvents {
  /** The player will respawn here. */
  checkpoint(position: Vec3): void;
}

type ZoneName = keyof typeof FORTRESS_ZONES;

const LOOT: Record<FortressChestId, Loot[]> = {
  mimic: [{ id: BlockId.GOLD, count: 1 }],
  secret: [
    { id: ItemId.STONE_SWORD, count: 1 },
    { id: BlockId.GOLD, count: 6 },
    { id: BlockId.GLASS, count: 16 },
  ],
  treasure: [
    { id: ItemId.RUNE_AXE, count: 1 },
    { id: BlockId.GOLD, count: 12 },
  ],
};

/** Seconds a crumbling slab holds once stepped on, and before it comes back. */
const CRUMBLE_DELAY = 0.6;
const CRUMBLE_RESTORE = 5;
/** Seconds the race portcullis stays open after leaving the plate. */
const PLATE_OPEN = 5;
/** Each group of rhythm spikes is up for `on` seconds every `period`, `offset` after the previous. */
const RHYTHM = { period: 2.4, on: 1.2, offset: 0.8 };
/** The rhythm spikes only move while the player is around (each change remeshes a chunk). */
const RHYTHM_AREA = zone(64, 88, -3, 9, -44, -23);
const GUARDIAN_HEALTH = 60;

const typeOf = (id: MobType['id']) => MOB_TYPES.find((t) => t.id === id) ?? MOB_TYPES[0];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * The Black Fortress at runtime: traps rather than fights. Slabs crumble under the player,
 * spikes rise in rhythm, a plate opens a portcullis for a few seconds, a chest is a trap,
 * and a single guardian waits on bridges over spikes. Checkpoints spare long walks back.
 */
export class Fortress {
  private readonly entered = new Set<ZoneName>();
  private readonly chests = new Map<string, FortressChestId>();
  private readonly crumbling: Crumbling;
  private readonly rhythm: Rhythm;
  /** Seconds before the race portcullis closes, or null while it is closed. */
  private gateTimer: number | null = null;
  private shownCountdown = 0;
  private guardian: Mob | null = null;
  private guardianDefeated = false;
  conquered = false;

  constructor(
    private readonly world: World,
    private readonly mobs: MobManager,
    readonly floorY: number,
    private readonly events: FortressEvents,
  ) {
    const chests = fortressLayout().chests;
    for (const id of Object.keys(chests) as FortressChestId[]) {
      const c = chests[id];
      this.chests.set(key(c.x, floorY + c.r, c.z), id);
    }
    this.crumbling = new Crumbling(world, events.burst, CRUMBLE_DELAY, CRUMBLE_RESTORE);
    const groups = RHYTHM_GROUPS.map((columns) => {
      const cells: Cell[] = [];
      for (const x of columns)
        for (let z = RHYTHM_Z[0]; z <= RHYTHM_Z[1]; z++) cells.push([x, floorY, z]);
      return cells;
    });
    this.rhythm = new Rhythm(world, groups, RHYTHM, BlockId.SPIKES);
  }

  contains(x: number, z: number): boolean {
    return fortressLayout().blueprint.contains(x, z);
  }

  /** Nothing can be built in the fortress in survival: every trial could be bridged. */
  canBuild(x: number, _y: number, z: number): boolean {
    return !this.contains(x, z);
  }

  update(dt: number, player: PlayerState): void {
    const p = player.position;
    const x = Math.floor(p.x);
    const r = Math.floor(p.y) - this.floorY;
    const z = Math.floor(p.z);
    for (const name of Object.keys(FORTRESS_ZONES) as ZoneName[]) {
      if (this.entered.has(name) || !inZone(FORTRESS_ZONES[name], x, r, z)) continue;
      this.entered.add(name);
      this.enter(name);
    }
    underfoot(this.world, player, (id) => {
      if (id === BlockId.PLATE) this.openGate();
    });
    this.crumbling.update(dt, player);
    if (inZone(RHYTHM_AREA, x, r, z)) this.rhythm.update(dt);
    this.updateGate(dt, player);
    this.updateGuardian(inZone(FORTRESS_ZONES.guardian, x, r, z));
  }

  /** Opens the chest at this block, if it is one of the fortress's. */
  openChest(x: number, y: number, z: number): Loot[] {
    const id = this.chests.get(key(x, y, z));
    this.world.setBlock(x, y, z, BlockId.AIR);
    this.events.burst(x, y, z, BlockId.CHEST);
    if (!id) return [];
    this.chests.delete(key(x, y, z));
    if (id === 'mimic') this.springMimic(x, z);
    if (id === 'treasure') {
      this.conquered = true;
      this.setDoor(FORTRESS_DOORS.shortcut, BlockId.AIR);
      this.events.rumble(600, 0.7);
      this.events.announce(
        'La Forteresse est vaincue !',
        'Vous avez déjoué tous ses pièges. La herse du hall s’ouvre vers la sortie.',
        7,
      );
    }
    return LOOT[id];
  }

  private enter(name: ZoneName): void {
    const say = (title: string, text: string) => this.events.announce(title, text);
    const checkpoint = CHECKPOINTS[name];
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
          'La Forteresse noire',
          'Bien plus dure que le château : des pièges partout, peu de monstres. Gare aux piques !',
        );
        break;
      case 'hall':
        say('Point de réapparition', 'Si vous mourez dans la forteresse, vous reviendrez ici.');
        break;
      case 'golden':
        say(
          'Épreuve 1 : le Chemin d’or',
          'Seules les dalles sous l’or tiennent bon… Levez les yeux !',
        );
        break;
      case 'rhythm':
        say(
          'Épreuve 2 : les Piques rythmées',
          'Attendez le bon moment et filez de refuge en refuge.',
        );
        break;
      case 'mimic':
        say('Épreuve 3 : le Trésor', 'Un coffre magnifique… trop beau pour être vrai ?');
        break;
      case 'race':
        say(
          'Épreuve 4 : la Course',
          'La dalle dorée ouvre la herse… pour quelques secondes seulement !',
        );
        break;
      case 'bridge':
        say(
          'Épreuve 5 : le Pont fragile',
          'Certaines dalles s’effritent sous vos pieds. Ne traînez pas !',
        );
        break;
      case 'guardian':
        say(
          'Épreuve 6 : le Gardien solitaire',
          'Un seul monstre… mais ses coups vous jettent dans les piques.',
        );
        break;
      case 'treasure':
        say('La salle du trésor', 'Le trésor de la forteresse vous attend.');
        break;
      case 'secret':
        say('Une salle secrète !', 'Le bâtisseur cachait ici sa réserve d’or.');
        break;
    }
  }

  private openGate(): void {
    if (this.gateTimer === null) {
      this.setDoor(FORTRESS_DOORS.raceExit, BlockId.AIR);
      this.events.rumble(150, 0.4);
    }
    this.gateTimer = PLATE_OPEN; // standing on the plate keeps it open
  }

  private updateGate(dt: number, player: PlayerState): void {
    if (this.gateTimer === null) return;
    this.gateTimer -= dt;
    const countdown = Math.ceil(this.gateTimer);
    if (countdown !== this.shownCountdown && countdown > 0) {
      this.shownCountdown = countdown;
      this.events.notify(
        countdown === PLATE_OPEN ? `La herse est ouverte : ${countdown} s !` : `${countdown}…`,
      );
    }
    if (this.gateTimer > 0) return;
    // Never close the portcullis on the player.
    const door = FORTRESS_DOORS.raceExit;
    if (playerInZone(player, this.floorY, door)) return;
    this.gateTimer = null;
    this.shownCountdown = 0;
    this.setDoor(door, BlockId.PORTCULLIS);
  }

  private updateGuardian(playerInRoom: boolean): void {
    const g = this.guardian;
    if (g && g.deathTimer !== null && !this.guardianDefeated) {
      this.guardianDefeated = true;
      this.setDoor(FORTRESS_DOORS.guardianExit, BlockId.AIR);
      this.events.rumble(400, 0.6);
      this.events.announce('Le Gardien est tombé !', 'La herse s’ouvre sur la salle du trésor.');
      return;
    }
    // (Re)spawned whenever the player is in its room: it may have been cleared by a respawn.
    if (this.guardianDefeated || !playerInRoom || (g && !this.mobs.isGone(g))) return;
    const brute = typeOf('brute');
    this.guardian = this.spawn(GUARDIAN_SPAWN, brute, true);
    this.guardian.maxHealth = this.guardian.health = GUARDIAN_HEALTH;
  }

  /** The false chest: the floor turns into spikes and something wakes up. */
  private springMimic(chestX: number, chestZ: number): void {
    const f = MIMIC_FLOOR;
    const y = this.floorY + f.minR;
    for (let z = f.minZ; z <= f.maxZ; z++) {
      for (let x = f.minX; x <= f.maxX; x++) {
        if (x !== chestX || z !== chestZ) this.world.setBlock(x, y, z, BlockId.SPIKES);
      }
    }
    for (let x = f.minX; x <= f.maxX; x += 3) this.events.burst(x, y, chestZ, BlockId.GOLD);
    this.events.rumble(500, 0.8);
    this.events.announce(
      'C’était un piège !',
      'Le coffre était presque vide… Cherchez plutôt un mur fissuré.',
    );
    this.spawn(MIMIC_SPAWN, typeOf('leaper'));
  }

  private spawn(p: CastlePos, type: MobType, burning = false): Mob {
    const position = { x: p.x + 0.5, y: this.floorY + p.r, z: p.z + 0.5 };
    return this.mobs.spawnAt(position, type, burning ? 1 : 0, burning);
  }

  private setDoor(door: CastleZone, id: number): void {
    fillZone(this.world, this.floorY, door, id);
  }
}
