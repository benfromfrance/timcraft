import { itemName } from '../items/items';
import { createItemIcon, drawItemIcon } from './icons';

/** What a hotbar slot shows; `count: null` means unlimited (creative). */
export interface SlotView {
  id: number;
  count: number | null;
  /** Remaining uses of a tool; a wear bar appears once it is used. */
  durability?: number;
}

interface SlotElements {
  root: HTMLDivElement;
  icon: HTMLCanvasElement;
  count: HTMLSpanElement;
  wear: HTMLDivElement;
}

const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const HEART_FULL = '#e0303a';
const HEART_EMPTY = '#3a1a1e';

/** Pixel heart; `fill` is 0 (empty), 0.5 (left half) or 1. */
function drawHeart(canvas: HTMLCanvasElement, fill: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  HEART.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell !== '#') return;
      const filled = fill >= 1 || (fill > 0 && x < 4);
      ctx.fillStyle = filled ? HEART_FULL : HEART_EMPTY;
      ctx.fillRect(x, y, 1, 1);
    });
  });
}

export class Hud {
  private readonly slots: SlotElements[] = [];
  private readonly debug: HTMLPreElement;
  private readonly toast: HTMLDivElement;
  private toastTimer = 0;
  private readonly hearts: HTMLCanvasElement[] = [];
  private readonly hurtFlash: HTMLDivElement;
  private readonly maxDurability: (id: number) => number | undefined;
  private shownHealth = -1;

  constructor(
    root: HTMLElement,
    private readonly atlas: HTMLCanvasElement,
    slotCount: number,
    options: { maxHealth: number; maxDurability: (id: number) => number | undefined },
  ) {
    this.maxDurability = options.maxDurability;
    this.hurtFlash = document.createElement('div');
    this.hurtFlash.className = 'hurt-flash';

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';

    this.debug = document.createElement('pre');
    this.debug.className = 'debug';
    this.debug.hidden = true;

    this.toast = document.createElement('div');
    this.toast.className = 'toast';

    const bar = document.createElement('div');
    bar.className = 'hotbar';
    for (let i = 0; i < slotCount; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const icon = createItemIcon(atlas, null);
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const count = document.createElement('span');
      count.className = 'count';
      const wear = document.createElement('div');
      wear.className = 'wear';
      slot.append(icon, key, count, wear);
      bar.append(slot);
      this.slots.push({ root: slot, icon, count, wear });
    }

    const health = document.createElement('div');
    health.className = 'health';
    for (let i = 0; i < options.maxHealth / 2; i++) {
      const heart = document.createElement('canvas');
      heart.width = 7;
      heart.height = 6;
      health.append(heart);
      this.hearts.push(heart);
    }

    const status = document.createElement('div');
    status.className = 'status';
    status.append(health, bar);
    root.append(this.hurtFlash, crosshair, this.debug, this.toast, status);
  }

  setSlots(views: readonly (SlotView | null)[]): void {
    views.forEach((view, i) => {
      const slot = this.slots[i];
      drawItemIcon(slot.icon, this.atlas, view?.id ?? null);
      slot.root.title = view ? itemName(view.id) : '';
      slot.count.textContent = view?.count != null && view.count > 1 ? String(view.count) : '';
      const max = view ? this.maxDurability(view.id) : undefined;
      const worn = max !== undefined && view?.durability !== undefined && view.durability < max;
      slot.wear.hidden = !worn;
      if (worn) {
        const ratio = (view.durability ?? 0) / max;
        slot.wear.style.setProperty('--ratio', String(ratio));
        slot.wear.style.setProperty('--hue', String(Math.round(ratio * 120)));
      }
    });
  }

  /** Health in half-hearts. */
  setHealth(health: number): void {
    if (health === this.shownHealth) return;
    this.shownHealth = health;
    this.hearts.forEach((heart, i) => drawHeart(heart, Math.max(0, Math.min(1, (health - i * 2) / 2))));
  }

  /** Visible in survival only. */
  setHealthVisible(visible: boolean): void {
    this.hearts[0]?.parentElement?.toggleAttribute('hidden', !visible);
  }

  flashHurt(): void {
    this.hurtFlash.classList.remove('active');
    void this.hurtFlash.offsetWidth; // restart the CSS animation
    this.hurtFlash.classList.add('active');
  }

  setSelected(index: number): void {
    this.slots.forEach((slot, i) => slot.root.classList.toggle('selected', i === index));
  }

  setDebugVisible(visible: boolean): void {
    this.debug.hidden = !visible;
  }

  setDebugText(text: string): void {
    if (!this.debug.hidden) this.debug.textContent = text;
  }

  /** Short message above the hotbar. */
  notify(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 1200);
  }
}
