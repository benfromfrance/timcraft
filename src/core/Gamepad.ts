/** Button indices of the W3C "standard" mapping (Xbox layout). */
export const PadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LEFT_STICK: 10,
  RIGHT_STICK: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;
export type PadButton = (typeof PadButton)[keyof typeof PadButton];

const STICK_DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.5;

/**
 * Radial deadzone: ignores stick drift near the centre and rescales the rest to [0, 1]
 * so small deflections still allow precise, slow movement.
 */
export function radialDeadzone(x: number, y: number, deadzone = STICK_DEADZONE): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadzone) return [0, 0];
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return [(x / magnitude) * scaled, (y / magnitude) * scaled];
}

/**
 * Polled gamepad state (the Gamepad API has no button events). Uses the first connected
 * pad; call `poll()` once per frame before reading.
 */
export class GamepadInput {
  onConnectionChange: (connected: boolean) => void = () => {};
  leftX = 0;
  leftY = 0;
  rightX = 0;
  rightY = 0;

  private down: boolean[] = [];
  private previous: boolean[] = [];
  private pad: Gamepad | null = null;

  constructor() {
    window.addEventListener('gamepadconnected', () => this.onConnectionChange(true));
    window.addEventListener('gamepaddisconnected', () => this.onConnectionChange(false));
  }

  get connected(): boolean {
    return this.pad !== null;
  }

  poll(): void {
    this.previous = this.down;
    this.pad = navigator.getGamepads?.().find((p): p is Gamepad => p?.connected === true) ?? null;
    if (!this.pad) {
      this.down = [];
      this.leftX = this.leftY = this.rightX = this.rightY = 0;
      return;
    }

    const { buttons, axes } = this.pad;
    this.down = buttons.map((b, i) =>
      i === PadButton.LT || i === PadButton.RT ? b.value > TRIGGER_THRESHOLD : b.pressed,
    );
    [this.leftX, this.leftY] = radialDeadzone(axes[0] ?? 0, axes[1] ?? 0);
    [this.rightX, this.rightY] = radialDeadzone(axes[2] ?? 0, axes[3] ?? 0);
  }

  isDown(button: PadButton): boolean {
    return this.down[button] === true;
  }

  /** True only on the frame the button went down. */
  wasPressed(button: PadButton): boolean {
    return this.down[button] === true && this.previous[button] !== true;
  }

  rumble(durationMs: number, strength: number): void {
    void this.pad?.vibrationActuator
      ?.playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: strength,
        weakMagnitude: strength,
      })
      .catch(() => {});
  }
}
