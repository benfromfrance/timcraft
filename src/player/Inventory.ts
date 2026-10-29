import { maxDurabilityOf, maxStackOf } from '../items/items';

export const HOTBAR_SIZE = 9;
/** Stack limit for blocks; tools have their own (see items.ts). */
export const STACK_SIZE = 64;

export interface ItemStack {
  id: number;
  count: number;
  /** Remaining uses, tools only. */
  durability?: number;
}

/** Survival hotbar: stacks of collected blocks. Pure data, independent of the UI. */
export class Inventory {
  readonly slots: (ItemStack | null)[] = Array.from({ length: HOTBAR_SIZE }, () => null);

  /** Adds items, topping up existing stacks first. Returns how many did not fit. */
  add(id: number, count = 1): number {
    const max = maxStackOf(id);
    let left = count;
    for (const slot of this.slots) {
      if (left === 0) break;
      if (slot?.id !== id || slot.count >= max) continue;
      const moved = Math.min(left, max - slot.count);
      slot.count += moved;
      left -= moved;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(left, max);
      const durability = maxDurabilityOf(id);
      this.slots[i] = durability === undefined ? { id, count: moved } : { id, count: moved, durability };
      left -= moved;
    }
    return left;
  }

  /** Removes one item from a slot; the slot empties when its stack runs out. */
  takeOne(index: number): boolean {
    const slot = this.slots[index];
    if (!slot) return false;
    slot.count--;
    if (slot.count === 0) this.slots[index] = null;
    return true;
  }

  /** Uses up one durability point of the tool in a slot. Returns true if it broke. */
  wear(index: number): boolean {
    const slot = this.slots[index];
    if (slot?.durability === undefined) return false;
    slot.durability--;
    if (slot.durability > 0) return false;
    this.slots[index] = null;
    return true;
  }

  indexOf(id: number): number {
    return this.slots.findIndex((slot) => slot?.id === id);
  }

  count(id: number): number {
    return this.slots.reduce((sum, slot) => sum + (slot?.id === id ? slot.count : 0), 0);
  }

  /** Removes up to `count` items of a kind, from the last stacks first. Returns how many were removed. */
  remove(id: number, count: number): number {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const slot = this.slots[i];
      if (slot?.id !== id) continue;
      const taken = Math.min(left, slot.count);
      slot.count -= taken;
      left -= taken;
      if (slot.count === 0) this.slots[i] = null;
    }
    return count - left;
  }

  snapshot(): (ItemStack | null)[] {
    return this.slots.map((slot) => slot && { ...slot });
  }

  restore(snapshot: readonly (ItemStack | null)[]): void {
    snapshot.forEach((slot, i) => (this.slots[i] = slot && { ...slot }));
  }
}
