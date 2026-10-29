import { ItemId } from '../items/items';
import type { Mob, MobManager } from '../mobs/MobManager';
import { MOB_TYPES, type MobType } from '../mobs/mobTypes';
import type { Vec3 } from '../player/Player';
import { BlockId } from '../world/blocks';
import {
  ARENA_CENTER,
  ARENA_SPAWNS,
  CASTLE,
  CASTLE_DOORS,
  CASTLE_ZONES,
  castleLayout,
  CRYPT_SPAWNS,
  GUARDIAN_SPAWN,
  inZone,
  PIT_SPAWNS,
  PROTECTED,
  TRAP_FLOOR,
  type CastlePos,
  type CastleZone,
  type ChestId,
} from '../world/generation/castle';
import type { World } from '../world/World';

export interface Loot {
  id: number;
  count: number;
}

/** How the castle talks to the rest of the game. */
export interface CastleEvents {
  announce(title: string, text?: string, seconds?: number): void;
  notify(text: string): void;
  burst(x: number, y: number, z: number, blockId: number): void;
  rumble(ms: number, strength: number): void;
}

type Treasure = ChestId | 'arena';
type ZoneName = keyof typeof CASTLE_ZONES;

const LOOT: Record<Treasure, Loot[]> = {
  welcome: [
    { id: ItemId.WOODEN_SWORD, count: 1 },
    { id: BlockId.PLANKS, count: 12 },
    { id: ItemId.STICK, count: 4 },
  ],
  maze: [
    { id: ItemId.STONE_SWORD, count: 1 },
    { id: BlockId.GLASS, count: 8 },
  ],
  crypt: [
    { id: ItemId.STONE_AXE, count: 1 },
    { id: BlockId.BRICKS, count: 16 },
  ],
  secret: [
    { id: BlockId.GOLD, count: 8 },
    { id: ItemId.STONE_SWORD, count: 1 },
    { id: BlockId.STONE_BRICKS, count: 16 },
  ],
  arena: [
    { id: ItemId.STONE_SWORD, count: 1 },
    { id: BlockId.COBBLESTONE, count: 24 },
    { id: BlockId.GOLD, count: 2 },
  ],
  throne: [
    { id: ItemId.RUNE_SWORD, count: 1 },
    { id: BlockId.GOLD, count: 4 },
  ],
};

const WAVES: MobType['id'][][] = [
  ['lurker', 'lurker', 'lurker'],
  ['leaper', 'leaper', 'lurker'],
  ['brute', 'leaper', 'lurker'],
];
const WAVE_DELAY = 2.5;
const GUARDIAN_DELAY = 1.5;
const GUARDIAN_HEALTH = 90;

const typeOf = (id: MobType['id']) => MOB_TYPES.find((t) => t.id === id) ?? MOB_TYPES[0];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * The castle's trials at runtime: rooms announce themselves, the floor gives way, monsters
 * attack in waves, chests hold treasures and the throne room hides a guardian.
 * Its blocks come from the generator (generation/castle.ts); this only reacts to the player.
 */
export class Castle {
  private readonly entered = new Set<ZoneName>();
  /** Unopened chests, by world position. */
  private readonly chests = new Map<string, Treasure>();
  private arena: 'idle' | 'fighting' | 'won' = 'idle';
  private wave = 0;
  private waveMobs: Mob[] = [];
  private waveDelay = 0;
  private guardian: Mob | null = null;
  /** Seconds until the guardian wakes, or null when it is not about to. */
  private guardianDelay: number | null = null;
  private guardianLost = false;
  conquered = false;

  constructor(
    private readonly world: World,
    private readonly mobs: MobManager,
    readonly floorY: number,
    private readonly events: CastleEvents,
  ) {
    const chests = castleLayout().chests;
    for (const id of Object.keys(chests) as ChestId[]) {
      const c = chests[id];
      this.chests.set(key(c.x, floorY + c.r, c.z), id);
    }
  }

  contains(x: number, z: number): boolean {
    return x >= CASTLE.minX && x <= CASTLE.maxX && z >= CASTLE.minZ && z <= CASTLE.maxZ;
  }

  /** Survival players may not build in the trial rooms (or on their roofs). */
  canBuild(x: number, y: number, z: number): boolean {
    return !inZone(PROTECTED, x, y - this.floorY, z);
  }

  update(dt: number, player: Vec3): void {
    const x = Math.floor(player.x);
    const r = Math.floor(player.y) - this.floorY;
    const z = Math.floor(player.z);
    for (const name of Object.keys(CASTLE_ZONES) as ZoneName[]) {
      if (this.entered.has(name) || !inZone(CASTLE_ZONES[name], x, r, z)) continue;
      this.entered.add(name);
      this.enter(name);
    }
    if (this.guardianLost && inZone(CASTLE_ZONES.hall, x, r, z)) this.wakeGuardian();
    this.updateArena(dt);
    this.updateGuardian(dt);
  }

  /** Opens the chest at this block, if it is one of the castle's. Returns its treasure. */
  openChest(x: number, y: number, z: number): Loot[] {
    const id = this.chests.get(key(x, y, z));
    this.world.setBlock(x, y, z, BlockId.AIR);
    this.events.burst(x, y, z, BlockId.CHEST);
    if (!id) return [];
    this.chests.delete(key(x, y, z));
    if (id === 'throne') {
      this.events.announce(
        'Le trésor du roi !',
        'Une épée runique… mais le sol se met à trembler.',
      );
      this.events.rumble(400, 0.5);
      this.guardianDelay = GUARDIAN_DELAY;
    }
    return LOOT[id];
  }

  /** Dying mid-fight resets the arena, so the player is not locked out of it. */
  onPlayerDeath(): void {
    if (this.arena !== 'fighting') return;
    for (const mob of this.waveMobs) this.mobs.discard(mob);
    this.waveMobs = [];
    this.wave = 0;
    this.arena = 'idle';
    this.entered.delete('arena');
    this.setDoor(CASTLE_DOORS.arenaEntrance, BlockId.AIR);
  }

  private enter(name: ZoneName): void {
    const say = (title: string, text: string) => this.events.announce(title, text);
    switch (name) {
      case 'courtyard':
        say(
          'Le château de TimCraft',
          'Des épreuves vous attendent… Un coffre vous souhaite la bienvenue !',
        );
        break;
      case 'maze':
        say(
          'Épreuve 1 : le Labyrinthe',
          'Trouvez la sortie… un trésor dort au fond d’une impasse.',
        );
        break;
      case 'chasm':
        say('Épreuve 2 : le Gouffre', 'Sautez de pilier en pilier. Courez pour les grands sauts !');
        break;
      case 'pit':
        say('Raté !', 'Des bestioles vivaient au fond du gouffre… L’escalier ramène au départ.');
        for (const p of PIT_SPAWNS) this.spawn(p, typeOf('leaper'));
        break;
      case 'arena':
        this.arena = 'fighting';
        this.wave = 0;
        this.waveDelay = WAVE_DELAY;
        this.setDoor(CASTLE_DOORS.arenaEntrance, BlockId.PORTCULLIS);
        this.events.rumble(250, 0.6);
        say(
          'Épreuve 3 : l’Arène',
          `La herse se referme… Survivez à ${WAVES.length} vagues de monstres !`,
        );
        break;
      case 'trap':
        this.collapse();
        break;
      case 'hall':
        say('La salle du trône', 'Le trésor du roi est là. Un des murs semble fissuré…');
        break;
    }
  }

  private collapse(): void {
    const t = TRAP_FLOOR;
    const y = this.floorY + t.minR;
    for (let z = t.minZ; z <= t.maxZ; z++) {
      for (let x = t.minX; x <= t.maxX; x++) this.world.setBlock(x, y, z, BlockId.AIR);
    }
    // A few bursts only: the particle pool is small.
    const midZ = Math.round((t.minZ + t.maxZ) / 2);
    for (let x = t.minX; x <= t.maxX; x += 2) this.events.burst(x, y, midZ, BlockId.CASTLE_STONE);
    this.events.rumble(500, 0.8);
    this.events.announce('Le sol s’effondre !', 'Bienvenue dans la crypte… vous n’êtes pas seul.');
    for (const p of CRYPT_SPAWNS) this.spawn(p, typeOf('lurker'));
  }

  private updateArena(dt: number): void {
    if (this.arena !== 'fighting') return;
    if (this.waveMobs.length > 0) {
      if (!this.waveMobs.every((m) => this.mobs.isGone(m))) return;
      this.waveMobs = [];
      this.wave++;
      if (this.wave === WAVES.length) {
        this.winArena();
        return;
      }
      this.events.notify(`Vague ${this.wave}/${WAVES.length} vaincue !`);
      this.waveDelay = WAVE_DELAY;
    }
    this.waveDelay -= dt;
    if (this.waveDelay > 0) return;
    this.events.announce(`Vague ${this.wave + 1}/${WAVES.length}`, '', 2);
    WAVES[this.wave].forEach((id, i) => {
      this.waveMobs.push(this.spawn(ARENA_SPAWNS[i % ARENA_SPAWNS.length], typeOf(id)));
    });
  }

  private winArena(): void {
    this.arena = 'won';
    this.setDoor(CASTLE_DOORS.arenaEntrance, BlockId.AIR);
    this.setDoor(CASTLE_DOORS.arenaExit, BlockId.AIR);
    const c = ARENA_CENTER;
    const y = this.floorY + c.r;
    this.world.setBlock(c.x, y, c.z, BlockId.CHEST);
    this.chests.set(key(c.x, y, c.z), 'arena');
    this.events.rumble(300, 0.5);
    this.events.announce(
      'Arène vaincue !',
      'Les herses s’ouvrent. Un coffre est apparu au centre.',
    );
  }

  private updateGuardian(dt: number): void {
    if (this.guardianDelay !== null) {
      this.guardianDelay -= dt;
      if (this.guardianDelay <= 0) this.wakeGuardian();
    }
    const g = this.guardian;
    if (!g || !this.mobs.isGone(g)) return;
    this.guardian = null;
    if (g.deathTimer === null) {
      this.guardianLost = true; // wandered off and despawned: it waits in the hall again
      return;
    }
    this.conquered = true;
    this.setDoor(CASTLE_DOORS.northExit, BlockId.AIR);
    this.events.rumble(600, 0.7);
    this.events.announce(
      'Victoire !',
      'Vous avez conquis le château de TimCraft. Une porte s’ouvre derrière le trône.',
      7,
    );
  }

  private wakeGuardian(): void {
    this.guardianDelay = null;
    this.guardianLost = false;
    const g = this.spawn(GUARDIAN_SPAWN, typeOf('brute'), true);
    g.maxHealth = g.health = GUARDIAN_HEALTH;
    this.guardian = g;
    this.events.rumble(400, 0.8);
    this.events.announce(
      'Le Gardien se réveille !',
      'Un colosse embrasé garde la sortie. Battez-le !',
    );
  }

  private spawn(p: CastlePos, type: MobType, burning = false): Mob {
    const position = { x: p.x + 0.5, y: this.floorY + p.r, z: p.z + 0.5 };
    return this.mobs.spawnAt(position, type, burning ? 1 : 0, burning);
  }

  private setDoor(door: CastleZone, id: number): void {
    for (let r = door.minR; r <= door.maxR; r++) {
      for (let z = door.minZ; z <= door.maxZ; z++) {
        for (let x = door.minX; x <= door.maxX; x++) this.world.setBlock(x, this.floorY + r, z, id);
      }
    }
  }
}
