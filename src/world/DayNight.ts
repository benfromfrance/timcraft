/** Length of a full day–night cycle, in seconds. */
export const DAY_LENGTH = 600;

type RGB = [number, number, number];
const DAY_SKY: RGB = [0.54, 0.72, 0.9];
const NIGHT_SKY: RGB = [0.03, 0.05, 0.13];
const DUSK_SKY: RGB = [0.92, 0.55, 0.33];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Height of the sun for a time of day: 0 at sunrise/sunset, 1 at noon, -1 at midnight. */
export function sunHeightAt(time: number): number {
  return Math.sin(time * Math.PI * 2);
}

/** 0 (full night) … 1 (full day), with a soft twilight around sunrise and sunset. */
export function daylightAt(time: number): number {
  return smoothstep(-0.12, 0.18, sunHeightAt(time));
}

/** Sky and fog colour: blue by day, dark blue at night, orange near the horizon at dusk/dawn. */
export function skyColorAt(time: number): RGB {
  const sky = mix(NIGHT_SKY, DAY_SKY, daylightAt(time));
  const dusk = Math.max(0, 1 - Math.abs(sunHeightAt(time)) / 0.25) * 0.55;
  return mix(sky, DUSK_SKY, dusk);
}

/** Time of day as a fraction: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. */
export class DayNight {
  time = 0.05; // the game starts in the morning

  update(dt: number): void {
    this.time = (this.time + dt / DAY_LENGTH) % 1;
  }

  get daylight(): number {
    return daylightAt(this.time);
  }

  /** Global light multiplier for the world: never fully black. */
  get brightness(): number {
    return 0.2 + 0.8 * this.daylight;
  }

  get isNight(): boolean {
    return this.daylight < 0.35;
  }

  /** Jumps to just before the next sunset (by day) or sunrise (at night). */
  skipToNextPhase(): void {
    this.time = this.isNight ? 0.97 : 0.47;
  }

  /** "HH:MM" on a 24 h clock where sunrise is 06:00. */
  get clock(): string {
    const minutes = Math.floor(((this.time * 24 + 6) % 24) * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}
