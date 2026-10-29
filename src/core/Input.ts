/**
 * Keyboard and mouse state. Keys use `KeyboardEvent.code` (physical position), so
 * ZQSD on AZERTY and WASD on QWERTY both map to KeyW/KeyA/KeyS/KeyD.
 */
export class Input {
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly buttonsDown = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;

  constructor(element: HTMLElement) {
    element.addEventListener('click', () => {
      if (!this.locked) void Promise.resolve(element.requestPointerLock()).catch(() => {});
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      if (!this.locked) this.reset();
      this.onLockChange(this.locked);
    });

    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'F3' || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.keysPressed.add(e.code);
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttonsDown.add(e.button);
      this.buttonsPressed.add(e.button);
    });
    document.addEventListener('mouseup', (e) => this.buttonsDown.delete(e.button));
    document.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  isButtonDown(button: number): boolean {
    return this.buttonsDown.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame(): void {
    this.keysPressed.clear();
    this.buttonsPressed.clear();
  }

  private reset(): void {
    this.keysDown.clear();
    this.buttonsDown.clear();
    this.endFrame();
  }
}
