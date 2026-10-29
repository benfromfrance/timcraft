import { hasIngredients } from '../crafting/Crafting';
import { RECIPES, type Recipe } from '../crafting/recipes';
import type { Inventory } from '../player/Inventory';
import { itemName } from '../items/items';
import { createItemIcon } from './icons';

/**
 * Recipe list shown over the game. Works with the mouse (click), the keyboard
 * (arrows / Enter / E) and, through `move` / `craftSelected` / `close`, the controller.
 */
export class CraftingMenu {
  onCraft: (recipe: Recipe, atTable: boolean) => void = () => {};
  onClose: () => void = () => {};

  private readonly backdrop: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly list: HTMLUListElement;
  private inventory: Inventory | null = null;
  private atTable = false;
  private selected = 0;

  constructor(
    parent: HTMLElement,
    private readonly atlas: HTMLCanvasElement,
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';
    this.backdrop.hidden = true;
    // Clicking outside the panel closes it (and keeps the click away from the canvas).
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    const panel = document.createElement('div');
    panel.className = 'craft-panel';

    const header = document.createElement('header');
    this.title = document.createElement('h2');
    const closeButton = document.createElement('button');
    closeButton.className = 'close';
    closeButton.textContent = '✕';
    closeButton.title = 'Fermer';
    closeButton.addEventListener('click', () => this.close());
    header.append(this.title, closeButton);

    this.list = document.createElement('ul');
    this.list.className = 'recipes';

    const footer = document.createElement('footer');
    footer.innerHTML =
      '<kbd>↑</kbd><kbd>↓</kbd> choisir · <kbd>Entrée</kbd> fabriquer · <kbd>E</kbd> fermer' +
      '<br />Manette : <kbd>croix</kbd> choisir · <kbd>A</kbd> fabriquer · <kbd>B</kbd> fermer';

    panel.append(header, this.list, footer);
    this.backdrop.append(panel);
    parent.append(this.backdrop);

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  open(inventory: Inventory, atTable: boolean): void {
    this.inventory = inventory;
    this.atTable = atTable;
    this.title.textContent = atTable ? 'Établi' : 'Fabrication';
    this.backdrop.hidden = false;
    document.body.classList.add('menu-open');
    // Start on the first recipe that can actually be made.
    const first = RECIPES.findIndex((r) => this.isAvailable(r));
    this.selected = Math.max(0, first);
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.backdrop.hidden = true;
    document.body.classList.remove('menu-open');
    this.onClose();
  }

  move(delta: number): void {
    const n = RECIPES.length;
    this.selected = (((this.selected + delta) % n) + n) % n;
    this.render();
  }

  craftSelected(): void {
    this.onCraft(RECIPES[this.selected], this.atTable);
  }

  /** Re-renders after the inventory changed. */
  render(): void {
    const inventory = this.inventory;
    if (!inventory) return;
    this.list.replaceChildren(
      ...RECIPES.map((recipe, index) => {
        const item = document.createElement('li');
        item.className = 'recipe';
        const locked = recipe.needsTable && !this.atTable;
        item.classList.toggle('selected', index === this.selected);
        item.classList.toggle('unavailable', !this.isAvailable(recipe));

        const output = document.createElement('div');
        output.className = 'output';
        const count = document.createElement('span');
        count.textContent = `×${recipe.output.count}`;
        output.append(createItemIcon(this.atlas, recipe.output.id), count);

        const info = document.createElement('div');
        info.className = 'info';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = itemName(recipe.output.id);
        const inputs = document.createElement('div');
        inputs.className = 'inputs';
        for (const input of recipe.inputs) {
          const have = inventory.count(input.id);
          const chip = document.createElement('span');
          chip.className = 'ingredient';
          chip.classList.toggle('lacking', have < input.count);
          const label = document.createElement('span');
          label.textContent = `${Math.min(have, input.count)}/${input.count} ${itemName(input.id)}`;
          chip.append(createItemIcon(this.atlas, input.id, 16), label);
          inputs.append(chip);
        }
        info.append(name, inputs);
        if (locked) {
          const hint = document.createElement('div');
          hint.className = 'hint';
          hint.textContent = 'Nécessite un établi';
          info.append(hint);
        }

        const button = document.createElement('button');
        button.textContent = 'Fabriquer';
        button.disabled = !this.isAvailable(recipe);
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selected = index;
          this.craftSelected();
        });

        item.addEventListener('click', () => {
          this.selected = index;
          this.render();
        });
        item.append(output, info, button);
        return item;
      }),
    );
    this.list.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private isAvailable(recipe: Recipe): boolean {
    if (recipe.needsTable && !this.atTable) return false;
    return this.inventory !== null && hasIngredients(this.inventory, recipe);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const actions: Record<string, () => void> = {
      ArrowUp: () => this.move(-1),
      KeyW: () => this.move(-1),
      ArrowDown: () => this.move(1),
      KeyS: () => this.move(1),
      Enter: () => this.craftSelected(),
      Space: () => this.craftSelected(),
      KeyE: () => this.close(),
      Escape: () => this.close(),
    };
    const action = actions[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat || e.code.startsWith('Arrow')) action();
  }
}
