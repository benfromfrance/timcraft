import { itemTile } from '../items/items';
import { ATLAS_COLS, TILE_SIZE } from '../world/blocks';

export const ICON_SIZE = 32;

/** Draws an item icon (a block's side texture, or a tool sprite), pixel-sharp; clears first. */
export function drawItemIcon(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, id: number | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (id === null) return;
  ctx.imageSmoothingEnabled = false;
  const tile = itemTile(id);
  const sx = (tile % ATLAS_COLS) * TILE_SIZE;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE_SIZE;
  ctx.drawImage(atlas, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, canvas.width, canvas.height);
}

export function createItemIcon(atlas: HTMLCanvasElement, id: number | null, size = ICON_SIZE): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  drawItemIcon(canvas, atlas, id);
  return canvas;
}
