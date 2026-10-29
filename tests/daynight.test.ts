import { describe, expect, it } from 'vitest';
import { DayNight, daylightAt, skyColorAt } from '../src/world/DayNight';

describe('DayNight', () => {
  it('is bright at noon and dark at midnight', () => {
    expect(daylightAt(0.25)).toBe(1);
    expect(daylightAt(0.75)).toBe(0);
    const noon = skyColorAt(0.25);
    const midnight = skyColorAt(0.75);
    expect(noon[2]).toBeGreaterThan(midnight[2] + 0.5);
  });

  it('turns orange at sunset', () => {
    const [r, , b] = skyColorAt(0.5);
    expect(r).toBeGreaterThan(b);
  });

  it('cycles and skips to the next phase', () => {
    const cycle = new DayNight();
    expect(cycle.isNight).toBe(false);
    cycle.skipToNextPhase();
    cycle.update(30); // a bit past sunset
    expect(cycle.isNight).toBe(true);
    expect(cycle.clock).toMatch(/^\d\d:\d\d$/);
    cycle.skipToNextPhase();
    cycle.update(40);
    expect(cycle.isNight).toBe(false);
  });
});
