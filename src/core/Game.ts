import * as THREE from 'three';
import { Castle, type CastleEvents, type Loot } from '../castle/Castle';
import { Citadel } from '../castle/Citadel';
import { Fortress } from '../castle/Fortress';
import { craft, type CraftResult } from '../crafting/Crafting';
import type { Recipe } from '../crafting/recipes';
import {
  isBlockItem,
  ItemId,
  itemName,
  maxDurabilityOf,
  weaponOf,
  type WeaponStats,
} from '../items/items';
import { MobManager, type Mob } from '../mobs/MobManager';
import { stepPlayer, type MoveInput } from '../player/Physics';
import { HOTBAR_SIZE, Inventory } from '../player/Inventory';
import { createPlayer, PLAYER_SIZE, playerIntersectsBlock, type Vec3 } from '../player/Player';
import { raycast, type RayHit } from '../player/Raycast';
import { BlockParticles } from '../render/BlockParticles';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { Renderer } from '../render/Renderer';
import { ViewModel } from '../render/ViewModel';
import { CraftingMenu } from '../ui/CraftingMenu';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { WorkerPool } from '../workers/WorkerPool';
import { BlockId, blockName, dropOf, isUnbreakable, SOLID } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/Chunk';
import { ChunkStreamer } from '../world/ChunkStreamer';
import { toChunkCoord } from '../world/coords';
import { DayNight } from '../world/DayNight';
import { CASTLE_SPAWN } from '../world/generation/castle';
import { TerrainGenerator } from '../world/generation/TerrainGenerator';
import { World } from '../world/World';
import { GamepadInput, PadButton } from './Gamepad';
import { Input } from './Input';

const RENDER_DISTANCE = 8;
const PHYSICS_DT = 1 / 60;
const REACH = 6;
const ATTACK_REACH = 3.5;
const ACTION_REPEAT_MS = 250;
const MOUSE_SENSITIVITY = 0.0025;
/** Right-stick turn rates at full deflection, in radians per second. */
const STICK_YAW_SPEED = 3.2;
const STICK_PITCH_SPEED = 2.4;
/** Health in half-hearts. */
const MAX_HEALTH = 20;
const HURT_INVULNERABILITY = 0.5;
const REGEN_DELAY = 5;
const REGEN_INTERVAL = 3;
const KNOCKBACK_SPEED = 6;
const KNOCKBACK_LIFT = 5;
/** Mobs are cleared around the spawn point when respawning. */
const RESPAWN_SAFE_RADIUS = 24;
/** Half-hearts lost per spike hit (at most one hit per invulnerability period). */
const SPIKE_DAMAGE = 2;
const SPIKE_KNOCKBACK = 0.5;

const clampUnit = (v: number) => Math.max(-1, Math.min(1, v));
const seconds = () => performance.now() / 1000;

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly pad = new GamepadInput();
  /** Playing with the controller (no pointer lock involved). */
  private padPlaying = false;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly crafting: CraftingMenu;
  /** The crafting menu was opened from mouse play: relock the pointer when it closes. */
  private resumeWithMouse = false;
  private readonly world = new World();
  private readonly chunks: ChunkRenderer;
  private readonly streamer: ChunkStreamer;
  private readonly mobs: MobManager;
  private readonly viewModel: ViewModel;
  private readonly particles: BlockParticles;
  private readonly castle: Castle;
  private readonly fortress: Fortress;
  private readonly citadel: Citadel;
  private readonly dayNight = new DayNight();
  private wasNight = false;
  private readonly player = createPlayer();
  private readonly previousPosition: Vec3 = { ...this.player.position };
  private spawnPoint: Vec3 = { ...this.player.position };
  private readonly highlight: THREE.LineSegments;
  private readonly lookDir = new THREE.Vector3();
  /** Survival: only what the player collected. */
  private readonly inventory = new Inventory();
  /** Creative: unlimited blocks, editable with pick-block. */
  private readonly creativeHotbar: number[] = [
    BlockId.DIRT,
    BlockId.STONE,
    BlockId.COBBLESTONE,
    BlockId.PLANKS,
    BlockId.LOG,
    BlockId.GLASS,
    BlockId.BRICKS,
    BlockId.CRAFTING_TABLE,
    ItemId.STONE_SWORD,
  ];
  private creative = false;
  private selected = 0;
  private target: RayHit | null = null;
  private targetMob: Mob | null = null;
  private health = MAX_HEALTH;
  private lastHurt = -Infinity;
  private regenTimer = 0;
  private dead = false;
  private readonly deathScreen: HTMLElement;
  private spawned = false;
  private accumulator = 0;
  private lastTime = 0;
  private lastAction = 0;
  private lastAttack = 0;
  private showDebug = false;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly seed: string,
  ) {
    Object.assign(this.player.position, CASTLE_SPAWN);
    this.renderer = new Renderer(canvas, RENDER_DISTANCE);
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => {
      // Mouse takes over: Escape must pause even if the controller started the game.
      if (locked) this.padPlaying = false;
      this.updateOverlay();
    };
    overlay.addEventListener('click', () => canvas.click());

    this.viewModel = new ViewModel(this.renderer.chunkMaterial.map as THREE.Texture);
    this.hud = new Hud(hudRoot, this.renderer.atlasCanvas, HOTBAR_SIZE, {
      maxHealth: MAX_HEALTH,
      maxDurability: maxDurabilityOf,
    });
    this.hud.setSelected(this.selected);
    this.hud.setHealth(this.health);
    this.refreshHotbar();
    this.minimap = new Minimap(hudRoot);

    this.crafting = new CraftingMenu(document.body, this.renderer.atlasCanvas);
    this.crafting.onCraft = (recipe, atTable) => this.craftRecipe(recipe, atTable);
    this.crafting.onClose = () => {
      if (this.resumeWithMouse) {
        // The overlay stays hidden unless relocking fails (then it offers to click again).
        void Promise.resolve(canvas.requestPointerLock()).catch(() => this.updateOverlay());
      } else {
        this.updateOverlay();
      }
    };
    this.pad.onConnectionChange = (connected) => {
      this.hud.notify(connected ? 'Manette connectée' : 'Manette déconnectée');
      if (!connected && this.padPlaying) {
        this.padPlaying = false;
        this.updateOverlay();
      }
    };

    const deathScreen = document.getElementById('death');
    if (!deathScreen) throw new Error('Écran de mort manquant');
    this.deathScreen = deathScreen;
    deathScreen.querySelector('button')?.addEventListener('click', () => {
      this.respawn();
      void Promise.resolve(canvas.requestPointerLock()).catch(() => this.updateOverlay());
    });

    this.chunks = new ChunkRenderer(this.renderer.scene, this.renderer.chunkMaterial);
    this.streamer = new ChunkStreamer(
      this.world,
      new WorkerPool(),
      this.chunks,
      seed,
      RENDER_DISTANCE,
    );
    this.mobs = new MobManager(this.world, this.renderer.scene);
    this.particles = new BlockParticles(this.renderer.scene, this.renderer.chunkMaterial);
    // Same floor heights as the workers compute when they stamp the buildings into the terrain.
    const terrain = new TerrainGenerator(seed);
    const events: CastleEvents = {
      announce: (title, text, seconds) => this.hud.announce(title, text, seconds),
      notify: (text) => this.hud.notify(text),
      burst: (x, y, z, id) => this.particles.burst(x, y, z, id),
      rumble: (ms, strength) => this.pad.rumble(ms, strength),
    };
    this.castle = new Castle(this.world, this.mobs, terrain.castleFloor, events);
    const checkpoint = (position: Vec3) => {
      this.spawnPoint = { ...position };
      this.hud.notify('Point de réapparition enregistré');
    };
    this.fortress = new Fortress(this.world, this.mobs, terrain.fortressFloor, {
      ...events,
      checkpoint,
    });
    this.citadel = new Citadel(this.world, terrain.citadelFloor, this.renderer.scene, {
      ...events,
      checkpoint,
      hurt: (damage, from, knockback) => this.hurtPlayer(damage, from, knockback),
    });
    // Only the buildings' own monsters roam inside their walls (the citadel has none at all).
    this.mobs.canSpawnAt = (x, z) =>
      !this.castle.contains(x, z) && !this.fortress.contains(x, z) && !this.citadel.contains(x, z);
    this.mobs.onPlayerHit = (damage, from, knockback) => this.hurtPlayer(damage, from, knockback);

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    this.highlight.visible = false;
    this.renderer.scene.add(this.highlight);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    this.pad.poll();
    if (this.dead) this.handleDeathPad();
    else if (this.crafting.isOpen) this.handleCraftingPad();
    else this.handlePause();
    this.handleLook(dt);
    this.handleKeys();
    const p = this.player.position;
    this.streamer.update(p.x, p.z);
    if (!this.spawned) this.trySpawn();

    // Fixed-step physics, frozen while the chunk under the player is not loaded.
    if (this.spawned && this.world.getChunk(toChunkCoord(p.x), toChunkCoord(p.z))) {
      this.accumulator += dt;
      const move = this.moveInput();
      const isSolid = (x: number, y: number, z: number) => this.world.isSolid(x, y, z);
      while (this.accumulator >= PHYSICS_DT) {
        Object.assign(this.previousPosition, p);
        stepPlayer(this.player, move, PHYSICS_DT, isSolid);
        this.mobs.step(PHYSICS_DT, this.player, !this.creative && !this.dead);
        this.regenerate(PHYSICS_DT);
        this.accumulator -= PHYSICS_DT;
      }
    }
    this.updateTimeOfDay(dt);
    if (this.spawned) {
      this.mobs.update(dt, this.player, {
        night: this.dayNight.isNight,
        light: this.dayNight.brightness,
      });
      this.castle.update(dt, this.player.position);
      this.fortress.update(dt, this.player);
      this.citadel.update(dt, this.player);
      this.checkSpikes();
    }

    this.particles.update(dt, (x, y, z) => this.world.isSolid(x, y, z));
    this.updateCamera();
    this.updateTarget();
    this.handleActions(now);
    this.minimap.update(this.world, this.player, this.mobs.mobs, this.spawnPoint, this.dayNight);
    const v = this.player.velocity;
    const walking = this.player.onGround && !this.player.flying;
    this.viewModel.update(dt, walking ? Math.hypot(v.x, v.z) : 0, this.renderer.aspect);
    this.updateDebug(dt);
    this.renderer.render(this.viewModel);
    this.input.endFrame();
  };

  private updateTimeOfDay(dt: number): void {
    this.dayNight.update(dt);
    this.renderer.setTimeOfDay(this.dayNight);
    this.viewModel.setLight(this.dayNight.brightness);
    const night = this.dayNight.isNight;
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.hud.notify(night ? 'La nuit tombe… les monstres s’embrasent !' : 'Le jour se lève');
    }
  }

  /** Places the player on the highest solid block of the spawn column once it is loaded. */
  private trySpawn(): void {
    const p = this.player.position;
    if (!this.world.getChunk(toChunkCoord(p.x), toChunkCoord(p.z))) return;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.world.isSolid(Math.floor(p.x), y, Math.floor(p.z))) {
        p.y = y + 1;
        break;
      }
    }
    Object.assign(this.previousPosition, p);
    this.spawnPoint = { ...p };
    this.spawned = true;
    this.hud.announce(
      'Le château de TimCraft',
      'Droit devant : le château. À l’est, la Forteresse noire ; à l’ouest, la Citadelle maudite, la pire de toutes…',
      7,
    );
  }

  /** Gameplay input is live: playing (mouse or controller), alive, and no menu open. */
  private get active(): boolean {
    return (this.input.locked || this.padPlaying) && !this.crafting.isOpen && !this.dead;
  }

  // Controller reads are ignored while the game is paused.
  private padDown(button: PadButton): boolean {
    return this.active && this.pad.isDown(button);
  }

  private padPressed(button: PadButton): boolean {
    return this.active && this.pad.wasPressed(button);
  }

  /** Menu pauses/resumes; A also resumes from the pause screen. */
  private handlePause(): void {
    if (this.active) {
      if (!this.pad.wasPressed(PadButton.MENU)) return;
      this.padPlaying = false;
      if (this.input.locked) document.exitPointerLock();
    } else if (this.pad.wasPressed(PadButton.MENU) || this.pad.wasPressed(PadButton.A)) {
      this.padPlaying = true;
    }
    this.updateOverlay();
  }

  private updateOverlay(): void {
    this.overlay.hidden = this.active || this.crafting.isOpen || this.dead;
  }

  private moveInput(): MoveInput {
    const i = this.input;
    const stickX = this.active ? this.pad.leftX : 0;
    const stickY = this.active ? this.pad.leftY : 0; // stick up is negative
    return {
      forward: clampUnit((i.isDown('KeyW') ? 1 : 0) - (i.isDown('KeyS') ? 1 : 0) - stickY),
      strafe: clampUnit((i.isDown('KeyD') ? 1 : 0) - (i.isDown('KeyA') ? 1 : 0) + stickX),
      jump: i.isDown('Space') || this.padDown(PadButton.A),
      shift:
        i.isDown('ShiftLeft') ||
        i.isDown('ShiftRight') ||
        this.padDown(PadButton.B) ||
        this.padDown(PadButton.LEFT_STICK),
    };
  }

  private handleLook(dt: number): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    let yaw = -dx * MOUSE_SENSITIVITY;
    let pitch = -dy * MOUSE_SENSITIVITY;
    if (this.active) {
      // Squared response curve: fine aiming near the centre, fast turns at full tilt.
      const { rightX: rx, rightY: ry } = this.pad;
      yaw -= rx * Math.abs(rx) * STICK_YAW_SPEED * dt;
      pitch -= ry * Math.abs(ry) * STICK_PITCH_SPEED * dt;
    }
    const limit = Math.PI / 2 - 0.01;
    this.player.yaw += yaw;
    this.player.pitch = Math.max(-limit, Math.min(limit, this.player.pitch + pitch));
  }

  private handleKeys(): void {
    const i = this.input;
    if (i.wasPressed('KeyF') || this.padPressed(PadButton.Y)) {
      this.player.flying = !this.player.flying;
      this.player.velocity.y = 0;
    }
    if (i.wasPressed('F3') || this.padPressed(PadButton.VIEW)) {
      this.showDebug = !this.showDebug;
      this.hud.setDebugVisible(this.showDebug);
    }
    // M sits where QWERTY has ';' on AZERTY keyboards (codes are physical positions).
    if (i.wasPressed('KeyM') || i.wasPressed('Semicolon'))
      this.hud.notify(this.minimap.cycleZoom());
    if (i.wasPressed('KeyE') || this.padPressed(PadButton.DPAD_UP)) this.openCrafting(false);
    if (i.wasPressed('KeyT') || this.padPressed(PadButton.DPAD_DOWN))
      this.dayNight.skipToNextPhase();
    if (i.wasPressed('KeyC') || this.padPressed(PadButton.RIGHT_STICK)) {
      this.creative = !this.creative;
      this.refreshHotbar();
      this.hud.setHealthVisible(!this.creative);
      this.hud.notify(this.creative ? 'Mode créatif' : 'Mode survie');
    }
    for (let n = 0; n < HOTBAR_SIZE; n++) {
      if (i.wasPressed(`Digit${n + 1}`)) this.select(n);
    }
    let step = i.consumeWheel();
    if (this.padPressed(PadButton.RB) || this.padPressed(PadButton.DPAD_RIGHT)) step++;
    if (this.padPressed(PadButton.LB) || this.padPressed(PadButton.DPAD_LEFT)) step--;
    if (step !== 0)
      this.select((((this.selected + step) % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE);
  }

  private select(index: number): void {
    this.selected = index;
    this.hud.setSelected(index);
    this.viewModel.setHeld(this.selectedItem());
    const id = this.selectedItem();
    this.hud.notify(id === null ? 'Vide' : itemName(id));
  }

  /** Item in the selected slot (block or tool), or null for an empty survival slot. */
  private selectedItem(): number | null {
    if (this.creative) return this.creativeHotbar[this.selected];
    return this.inventory.slots[this.selected]?.id ?? null;
  }

  /** Selected item if it can be placed. */
  private selectedBlock(): number | null {
    const id = this.selectedItem();
    return id !== null && isBlockItem(id) ? id : null;
  }

  private refreshHotbar(): void {
    this.hud.setSlots(
      this.creative ? this.creativeHotbar.map((id) => ({ id, count: null })) : this.inventory.slots,
    );
    this.viewModel.setHeld(this.selectedItem());
  }

  /** Middle click / X: creative copies the block into the slot, survival jumps to its stack. */
  private pickBlock(id: number): void {
    if (this.creative) {
      this.creativeHotbar[this.selected] = id;
      this.refreshHotbar();
      this.select(this.selected);
      return;
    }
    const index = this.inventory.indexOf(dropOf(id));
    if (index >= 0) this.select(index);
  }

  private updateCamera(): void {
    const alpha = this.accumulator / PHYSICS_DT;
    const prev = this.previousPosition;
    const cur = this.player.position;
    const camera = this.renderer.camera;
    camera.position.set(
      prev.x + (cur.x - prev.x) * alpha,
      prev.y + (cur.y - prev.y) * alpha + PLAYER_SIZE.eyeHeight,
      prev.z + (cur.z - prev.z) * alpha,
    );
    camera.rotation.set(this.player.pitch, this.player.yaw, 0);
  }

  /** Aims at a block and/or a mob; a mob in front of the block (and in reach) wins. */
  private updateTarget(): void {
    const camera = this.renderer.camera;
    camera.getWorldDirection(this.lookDir);
    // Ghost slabs are never highlighted: aiming must not reveal the invisible bridge.
    this.target = raycast(camera.position, this.lookDir, REACH, (x, y, z) => {
      const id = this.world.getBlock(x, y, z);
      return SOLID[id] === 1 && id !== BlockId.GHOST && id !== BlockId.GHOST_SHOWN;
    });
    const mobHit = this.mobs.raycast(camera.position, this.lookDir, ATTACK_REACH);
    this.targetMob =
      mobHit && (!this.target || mobHit.distance < this.target.distance) ? mobHit.mob : null;

    this.highlight.visible = this.target !== null && this.targetMob === null;
    if (this.target)
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
  }

  private handleActions(now: number): void {
    const i = this.input;
    const hitPressed = i.wasButtonPressed(0) || this.padPressed(PadButton.RT);
    const hitHeld = i.isButtonDown(0) || this.padDown(PadButton.RT);
    const usePressed = i.wasButtonPressed(2) || this.padPressed(PadButton.LT);
    const useHeld = i.isButtonDown(2) || this.padDown(PadButton.LT);

    // Attacking: on press, then again as soon as the weapon's cooldown allows while held.
    if (this.targetMob && hitHeld) {
      const weapon = weaponOf(this.selectedItem());
      if (now - this.lastAttack >= weapon.cooldown * 1000) {
        this.lastAttack = now;
        this.attack(this.targetMob, weapon);
      }
      return;
    }

    const hit = this.target;
    if (!hit) {
      if (hitPressed) this.viewModel.swingArm(); // swing at the air
      return;
    }

    if (i.wasButtonPressed(1) || this.padPressed(PadButton.X)) {
      this.pickBlock(this.world.getBlock(hit.x, hit.y, hit.z));
    }

    // Using a crafting table opens it instead of placing a block against it.
    const targetId = this.world.getBlock(hit.x, hit.y, hit.z);
    if (usePressed && !this.creative && targetId === BlockId.CRAFTING_TABLE) {
      this.openCrafting(true);
      return;
    }
    if (targetId === BlockId.CHEST && (usePressed || hitPressed)) {
      this.openChest(hit.x, hit.y, hit.z);
      return;
    }

    // Blocks: act on press, then repeat while held.
    const repeat = now - this.lastAction > ACTION_REPEAT_MS;
    const breaking = hitPressed || (hitHeld && repeat);
    const placing = usePressed || (useHeld && repeat);

    if (breaking) {
      this.lastAction = now;
      this.viewModel.swingArm();
      if (!this.creative && isUnbreakable(targetId)) {
        this.hud.notify(`${blockName(targetId)} : indestructible`);
        return;
      }
      // The bottom layer stays so the player can never fall out of the world.
      if (hit.y === 0 || !this.world.setBlock(hit.x, hit.y, hit.z, BlockId.AIR)) return;
      this.particles.burst(hit.x, hit.y, hit.z, targetId);
      if (this.padDown(PadButton.RT)) this.pad.rumble(60, 0.35);
      if (!this.creative) this.collect(dropOf(targetId));
    } else if (placing) {
      this.lastAction = now;
      const id = this.selectedBlock();
      if (id === null) return;
      const x = hit.x + hit.nx;
      const y = hit.y + hit.ny;
      const z = hit.z + hit.nz;
      const free = this.world.getBlock(x, y, z) === BlockId.AIR;
      if (!free || (SOLID[id] && playerIntersectsBlock(this.player, x, y, z))) return;
      const buildable =
        this.castle.canBuild(x, y, z) &&
        this.fortress.canBuild(x, y, z) &&
        this.citadel.canBuild(x, y, z);
      if (!this.creative && !buildable) {
        this.hud.notify('Impossible de construire dans le château');
        return;
      }
      if (!this.world.setBlock(x, y, z, id)) return;
      this.viewModel.swingArm();
      if (this.padDown(PadButton.LT)) this.pad.rumble(40, 0.2);
      if (!this.creative) {
        this.inventory.takeOne(this.selected);
        this.refreshHotbar();
      }
    }
  }

  /** Chest loot always goes to the survival inventory, even when opened in creative. */
  private openChest(x: number, y: number, z: number): void {
    const building = this.fortress.contains(x, z)
      ? this.fortress
      : this.citadel.contains(x, z)
        ? this.citadel
        : this.castle;
    const loot: Loot[] = building.openChest(x, y, z);
    this.viewModel.swingArm();
    this.pad.rumble(80, 0.4);
    let lost = 0;
    for (const { id, count } of loot) lost += this.inventory.add(id, count);
    this.refreshHotbar();
    const list = loot.map(({ id, count }) =>
      count > 1 ? `${count} × ${itemName(id)}` : itemName(id),
    );
    this.hud.notify(
      loot.length === 0
        ? 'Le coffre est vide'
        : `Trésor : ${list.join(', ')}${lost > 0 ? ' (inventaire plein !)' : ''}`,
    );
  }

  private attack(mob: Mob, weapon: WeaponStats): void {
    this.viewModel.swingArm();
    const killed = this.mobs.hit(mob, weapon.damage, this.player.position);
    this.pad.rumble(70, killed ? 0.6 : 0.4);
    if (this.creative) return;

    // Weapons wear out with each hit.
    const id = this.selectedItem();
    if (id !== null && this.inventory.wear(this.selected))
      this.hud.notify(`${itemName(id)} : cassée !`);
    this.refreshHotbar();
  }

  private hurtPlayer(damage: number, from: Vec3, knockback: number): void {
    if (this.creative || this.dead) return;
    const t = seconds();
    if (t - this.lastHurt < HURT_INVULNERABILITY) return;
    this.lastHurt = t;
    this.regenTimer = 0;
    this.health = Math.max(0, this.health - damage);
    this.hud.setHealth(this.health);
    this.hud.flashHurt();
    this.pad.rumble(160, 0.7);

    const p = this.player;
    const dx = p.position.x - from.x;
    const dz = p.position.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    p.velocity.x = (dx / len) * KNOCKBACK_SPEED * knockback;
    p.velocity.z = (dz / len) * KNOCKBACK_SPEED * knockback;
    if (!p.flying) p.velocity.y = KNOCKBACK_LIFT * Math.min(knockback, 1.3);
    p.onGround = false;

    if (this.health === 0) this.die();
  }

  /** Spikes hurt while the player's body is in them, pushing them on in the way they were going. */
  private checkSpikes(): void {
    if (this.dead) return;
    const p = this.player.position;
    const v = this.player.velocity;
    const half = PLAYER_SIZE.width / 2 - 0.05;
    for (const y of [p.y + 0.1, p.y + 1]) {
      for (const dx of [-half, half]) {
        for (const dz of [-half, half]) {
          const id = this.world.getBlock(Math.floor(p.x + dx), Math.floor(y), Math.floor(p.z + dz));
          if (id !== BlockId.SPIKES) continue;
          this.hurtPlayer(SPIKE_DAMAGE, { x: p.x - v.x, y: p.y, z: p.z - v.z }, SPIKE_KNOCKBACK);
          return;
        }
      }
    }
  }

  /** Slowly heals after a few seconds without taking damage. */
  private regenerate(dt: number): void {
    if (this.dead || this.health >= MAX_HEALTH || seconds() - this.lastHurt < REGEN_DELAY) return;
    this.regenTimer += dt;
    if (this.regenTimer < REGEN_INTERVAL) return;
    this.regenTimer = 0;
    this.health++;
    this.hud.setHealth(this.health);
  }

  private die(): void {
    this.dead = true;
    this.castle.onPlayerDeath();
    this.resumeWithMouse = false;
    this.crafting.close();
    if (this.input.locked) document.exitPointerLock();
    this.deathScreen.hidden = false;
    this.updateOverlay();
  }

  /** Back at the spawn point with full health; the inventory is kept. */
  private respawn(): void {
    if (!this.dead) return;
    this.dead = false;
    this.health = MAX_HEALTH;
    this.lastHurt = -Infinity;
    this.hud.setHealth(this.health);
    Object.assign(this.player.position, this.spawnPoint);
    Object.assign(this.previousPosition, this.spawnPoint);
    this.player.velocity = { x: 0, y: 0, z: 0 };
    this.mobs.clearNear(this.spawnPoint, RESPAWN_SAFE_RADIUS);
    this.deathScreen.hidden = true;
    this.updateOverlay();
  }

  private handleDeathPad(): void {
    if (!this.pad.wasPressed(PadButton.A) && !this.pad.wasPressed(PadButton.MENU)) return;
    this.respawn();
    this.padPlaying = true;
    this.updateOverlay();
  }

  private openCrafting(atTable: boolean): void {
    if (this.creative) {
      this.hud.notify('La fabrication se fait en mode survie');
      return;
    }
    this.resumeWithMouse = this.input.locked;
    this.crafting.open(this.inventory, atTable);
    if (this.input.locked) document.exitPointerLock(); // free the cursor for clicking
    this.updateOverlay();
  }

  private handleCraftingPad(): void {
    const pad = this.pad;
    if (pad.wasPressed(PadButton.DPAD_UP)) this.crafting.move(-1);
    if (pad.wasPressed(PadButton.DPAD_DOWN)) this.crafting.move(1);
    if (pad.wasPressed(PadButton.A)) this.crafting.craftSelected();
    if (pad.wasPressed(PadButton.B) || pad.wasPressed(PadButton.MENU)) this.crafting.close();
  }

  private craftRecipe(recipe: Recipe, atTable: boolean): void {
    const result = craft(this.inventory, recipe, atTable);
    const messages: Record<CraftResult, string> = {
      ok: `+ ${recipe.output.count} ${itemName(recipe.output.id)}`,
      'needs-table': 'Nécessite un établi',
      missing: 'Ingrédients manquants',
      full: 'Inventaire plein',
    };
    this.hud.notify(messages[result]);
    if (result === 'ok') this.pad.rumble(50, 0.25);
    this.refreshHotbar();
    this.crafting.render();
  }

  private collect(id: number): void {
    if (id === BlockId.AIR) return;
    const hadStack = this.inventory.indexOf(id) >= 0;
    if (this.inventory.add(id) > 0) {
      this.hud.notify('Inventaire plein');
      return;
    }
    this.refreshHotbar();
    // A new kind of block: show its name so the player notices where it went.
    if (!hadStack) this.hud.notify(`+ ${itemName(id)}`);
  }

  private updateDebug(dt: number): void {
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    if (!this.showDebug) return;
    const p = this.player.position;
    const t = this.target;
    this.hud.setDebugText(
      [
        `TimCraft — graine : ${this.seed}`,
        `FPS : ${this.fps}`,
        `XYZ : ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `Chunk : ${toChunkCoord(p.x)}, ${toChunkCoord(p.z)}`,
        `Chunks : ${this.world.chunks.size} chargés, ${this.chunks.count} affichés`,
        `Mode : ${this.creative ? 'créatif' : 'survie'}, ${this.player.flying ? 'vol' : 'marche'}${this.player.onGround ? ' (au sol)' : ''}`,
        `Heure : ${this.dayNight.clock} (${this.dayNight.isNight ? 'nuit' : 'jour'}) · T pour avancer`,
        `Vie : ${this.health}/${MAX_HEALTH} · Monstres : ${this.mobs.aliveCount}`,
        `Manette : ${this.pad.connected ? 'connectée' : '—'}`,
        `Cible : ${this.targetMob ? `${this.targetMob.type.name} (${this.targetMob.health} PV)` : t ? `${itemName(this.world.getBlock(t.x, t.y, t.z))} (${t.x}, ${t.y}, ${t.z})` : '—'}`,
      ].join('\n'),
    );
  }
}
