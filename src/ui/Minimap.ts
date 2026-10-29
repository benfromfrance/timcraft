import type { Mob } from '../mobs/MobManager';
import type { PlayerState, Vec3 } from '../player/Player';
import { BLOCKS } from '../world/blocks';
import { CHUNK_SIZE, type Chunk } from '../world/Chunk';
import { chunkKey, toChunkCoord } from '../world/coords';
import type { DayNight } from '../world/DayNight';
import { chunkSurface } from '../world/surface';
import type { World } from '../world/World';

/** Map diameter in CSS pixels. */
const SIZE = 160;
/** Blocks from the centre to the edge for each zoom level (whole pixels per block). */
const ZOOMS = [40, 80];
/** Chunk tiles (re)painted per frame, to avoid a spike when many chunks load at once. */
const TILES_PER_FRAME = 6;
const CLEANUP_INTERVAL = 120;
const UNEXPLORED = '#11161b';

interface Tile {
  chunk: Chunk;
  revision: number;
  canvas: HTMLCanvasElement;
}

/** Top-down, north-up circular map of the loaded world around the player. */
export class Minimap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly info: HTMLDivElement;
  private readonly ratio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  private readonly tiles = new Map<string, Tile>();
  /** Index into ZOOMS; ZOOMS.length means hidden. */
  private zoom = 0;
  private budget = 0;
  private frames = 0;
  private shownInfo = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE * this.ratio;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    this.info = document.createElement('div');
    this.info.className = 'minimap-info';
    this.root.append(this.canvas, this.info);
    parent.append(this.root);
  }

  /** Close → far → hidden. Returns a message for the player. */
  cycleZoom(): string {
    this.zoom = (this.zoom + 1) % (ZOOMS.length + 1);
    this.root.hidden = this.zoom === ZOOMS.length;
    return this.root.hidden ? 'Mini-carte masquée' : `Mini-carte : ${ZOOMS[this.zoom] * 2} blocs`;
  }

  update(
    world: World,
    player: PlayerState,
    mobs: readonly Mob[],
    spawn: Vec3,
    time: DayNight,
  ): void {
    if (this.root.hidden) return;
    if (++this.frames % CLEANUP_INTERVAL === 0) this.evictUnloaded(world);
    this.budget = TILES_PER_FRAME;

    const ctx = this.ctx;
    const radius = ZOOMS[this.zoom];
    const scale = SIZE / (2 * radius); // CSS pixels per block
    const { x: px, z: pz } = player.position;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = UNEXPLORED;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Snapped to device pixels so tiles stay crisp and seamless.
    const originX = Math.round((SIZE / 2 - px * scale) * this.ratio) / this.ratio;
    const originZ = Math.round((SIZE / 2 - pz * scale) * this.ratio) / this.ratio;
    const tileSize = CHUNK_SIZE * scale;
    for (let cz = toChunkCoord(pz - radius); cz <= toChunkCoord(pz + radius); cz++) {
      for (let cx = toChunkCoord(px - radius); cx <= toChunkCoord(px + radius); cx++) {
        const tile = this.tile(world, cx, cz);
        if (tile) {
          ctx.drawImage(
            tile.canvas,
            originX + cx * CHUNK_SIZE * scale,
            originZ + cz * CHUNK_SIZE * scale,
            tileSize,
            tileSize,
          );
        }
      }
    }

    const toMap = (x: number, z: number): [number, number] => [
      SIZE / 2 + (x - px) * scale,
      SIZE / 2 + (z - pz) * scale,
    ];
    const inside = (mx: number, my: number, margin: number) =>
      Math.hypot(mx - SIZE / 2, my - SIZE / 2) < SIZE / 2 - margin;

    for (const mob of mobs) {
      if (mob.deathTimer !== null) continue;
      const [mx, my] = toMap(mob.body.position.x, mob.body.position.z);
      if (!inside(mx, my, 3)) continue;
      ctx.fillStyle = mob.fire > 0.5 ? '#ff9a2e' : '#e23b3b';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, mob.type.size.width > 1 ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    this.drawSpawn(...toMap(spawn.x, spawn.z));
    this.drawPlayer(player.yaw);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeText('N', SIZE / 2, 4);
    ctx.fillText('N', SIZE / 2, 4);

    const p = player.position;
    const text = `X ${Math.floor(p.x)}  Y ${Math.floor(p.y)}  Z ${Math.floor(p.z)}  ${time.isNight ? '☾' : '☀'} ${time.clock}`;
    if (text !== this.shownInfo) {
      this.shownInfo = text;
      this.info.textContent = text;
    }
  }

  /** Home marker; pinned to the rim when the spawn point is off the map, so it can be found. */
  private drawSpawn(mx: number, my: number): void {
    const c = SIZE / 2;
    const dist = Math.hypot(mx - c, my - c);
    const max = c - 7;
    if (dist > max) {
      mx = c + ((mx - c) / dist) * max;
      my = c + ((my - c) / dist) * max;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, my - 5);
    ctx.lineTo(mx + 5, my);
    ctx.lineTo(mx + 3.5, my);
    ctx.lineTo(mx + 3.5, my + 4);
    ctx.lineTo(mx - 3.5, my + 4);
    ctx.lineTo(mx - 3.5, my);
    ctx.lineTo(mx - 5, my);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  private drawPlayer(yaw: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    // yaw 0 faces -Z, which is up on the map; yaw grows counter-clockwise seen from above.
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  /** Cached 16×16 picture of a chunk; repainted when edited, within the per-frame budget. */
  private tile(world: World, cx: number, cz: number): Tile | null {
    const key = chunkKey(cx, cz);
    const chunk = world.getChunk(cx, cz);
    const cached = this.tiles.get(key);
    if (!chunk) return null;
    const fresh = cached?.chunk === chunk;
    if (fresh && cached.revision === chunk.revision) return cached;
    if (this.budget <= 0) return fresh ? cached : null; // slightly stale beats a hole
    this.budget--;

    const tile = fresh ? cached : { chunk, revision: 0, canvas: document.createElement('canvas') };
    tile.revision = chunk.revision;
    tile.canvas.width = tile.canvas.height = CHUNK_SIZE;
    paintTile(tile.canvas, chunk);
    this.tiles.set(key, tile);
    return tile;
  }

  private evictUnloaded(world: World): void {
    for (const [key, tile] of this.tiles) {
      if (world.getChunk(tile.chunk.cx, tile.chunk.cz) !== tile.chunk) this.tiles.delete(key);
    }
  }
}

/** Block colours from above, lit from the north-west so slopes read as relief. */
function paintTile(canvas: HTMLCanvasElement, chunk: Chunk): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { ids, heights } = chunkSurface(chunk);
  const image = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
  const data = image.data;
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const i = x + z * CHUNK_SIZE;
      const h = heights[i];
      // Height step from the northern neighbour (the first row looks south instead).
      const slope = z > 0 ? h - heights[i - CHUNK_SIZE] : heights[i + CHUNK_SIZE] - h;
      const relief = slope > 0 ? 1.15 : slope < 0 ? 0.78 : 1;
      const altitude = 0.85 + Math.min(1, Math.max(0, (h - 48) / 64)) * 0.3;
      const shade = relief * altitude;
      const color = BLOCKS[ids[i]]?.mapColor ?? 0;
      const o = i * 4;
      data[o] = ((color >> 16) & 0xff) * shade;
      data[o + 1] = ((color >> 8) & 0xff) * shade;
      data[o + 2] = (color & 0xff) * shade;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
