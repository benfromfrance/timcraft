import * as THREE from 'three';

const PIXELS_WIDE = 48;
const PIXELS_HIGH = 6;

/** Billboard health bar floating above a mob, redrawn only when its health changes. */
export class HealthBar {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;
  private shown = -1;

  constructor(width: number) {
    this.canvas.width = PIXELS_WIDE;
    this.canvas.height = PIXELS_HIGH;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(width, (width * PIXELS_HIGH) / PIXELS_WIDE, 1);
    this.sprite.visible = false;
  }

  /** `ratio` of health left, 0 … 1: green when healthy, red when nearly dead. */
  set(ratio: number): void {
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * (PIXELS_WIDE - 2));
    if (filled === this.shown) return;
    this.shown = filled;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, PIXELS_WIDE, PIXELS_HIGH);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, PIXELS_WIDE, PIXELS_HIGH);
    ctx.fillStyle = '#4a1414';
    ctx.fillRect(1, 1, PIXELS_WIDE - 2, PIXELS_HIGH - 2);
    ctx.fillStyle = `hsl(${Math.round(ratio * 120)}, 80%, 48%)`;
    ctx.fillRect(1, 1, filled, PIXELS_HIGH - 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; // highlight on the top row
    ctx.fillRect(1, 1, filled, 1);
    this.texture.needsUpdate = true;
  }

  setOpacity(opacity: number): void {
    this.material.opacity = opacity;
    this.sprite.visible = opacity > 0;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }
}
