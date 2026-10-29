import type { Inventory } from '../player/Inventory';
import type { Recipe } from './recipes';

export type CraftResult = 'ok' | 'needs-table' | 'missing' | 'full';

export function hasIngredients(inventory: Inventory, recipe: Recipe): boolean {
  return recipe.inputs.every((input) => inventory.count(input.id) >= input.count);
}

/** Consumes the inputs and adds the output, or leaves the inventory untouched on failure. */
export function craft(inventory: Inventory, recipe: Recipe, atTable: boolean): CraftResult {
  if (recipe.needsTable && !atTable) return 'needs-table';
  if (!hasIngredients(inventory, recipe)) return 'missing';

  const backup = inventory.snapshot();
  for (const input of recipe.inputs) inventory.remove(input.id, input.count);
  if (inventory.add(recipe.output.id, recipe.output.count) > 0) {
    inventory.restore(backup);
    return 'full';
  }
  return 'ok';
}
