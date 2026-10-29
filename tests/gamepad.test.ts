import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadInput, PadButton, radialDeadzone } from '../src/core/Gamepad';

describe('radialDeadzone', () => {
  it('ignores small deflections and rescales the rest', () => {
    expect(radialDeadzone(0.1, 0.05)).toEqual([0, 0]);
    const [x, y] = radialDeadzone(1, 0);
    expect(x).toBeCloseTo(1);
    expect(y).toBe(0);
    const [dx, dy] = radialDeadzone(0.6, 0.8); // magnitude 1, diagonal
    expect(Math.hypot(dx, dy)).toBeCloseTo(1);
  });
});

describe('GamepadInput', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakePad(pressed: number[], triggers: { lt?: number; rt?: number } = {}) {
    const buttons = Array.from({ length: 17 }, (_, i) => {
      const value = i === PadButton.LT ? (triggers.lt ?? 0) : i === PadButton.RT ? (triggers.rt ?? 0) : 0;
      return { pressed: pressed.includes(i), value };
    });
    return { connected: true, buttons, axes: [0, -1, 0.05, 0] };
  }

  it('detects presses once and reads triggers by value', () => {
    let pad = fakePad([]);
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('navigator', { getGamepads: () => [null, pad] });
    const input = new GamepadInput();

    input.poll();
    expect(input.connected).toBe(true);
    expect(input.leftY).toBeCloseTo(-1);
    expect(input.rightX).toBe(0); // inside the deadzone

    pad = fakePad([PadButton.A], { rt: 0.8, lt: 0.3 });
    input.poll();
    expect(input.wasPressed(PadButton.A)).toBe(true);
    expect(input.isDown(PadButton.RT)).toBe(true);
    expect(input.isDown(PadButton.LT)).toBe(false);

    input.poll();
    expect(input.isDown(PadButton.A)).toBe(true);
    expect(input.wasPressed(PadButton.A)).toBe(false);
  });

  it('reports nothing when no controller is connected', () => {
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('navigator', { getGamepads: () => [null, null] });
    const input = new GamepadInput();
    input.poll();
    expect(input.connected).toBe(false);
    expect(input.isDown(PadButton.A)).toBe(false);
  });
});
