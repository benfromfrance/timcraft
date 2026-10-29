import * as THREE from 'three';
import { CHUNK_SIZE } from '../world/Chunk';
import { skyColorAt, type DayNight } from '../world/DayNight';
import { createAtlasCanvas, createAtlasTexture } from './TextureAtlas';

const SKY_COLOR = 0x8ab8e6;
/** Sun, moon and stars sit inside the view distance but ignore fog. */
const SKY_RADIUS = 150;
const STAR_COUNT = 500;

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly atlasCanvas: HTMLCanvasElement;
  /** Shared by every chunk: one texture + vertex colours (baked AO and face shading). */
  readonly chunkMaterial: THREE.MeshBasicMaterial;
  private readonly webgl: THREE.WebGLRenderer;
  /** Follows the camera so the sky never gets closer. */
  private readonly sky = new THREE.Group();
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly skyColor = new THREE.Color();

  constructor(canvas: HTMLCanvasElement, renderDistance: number) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.autoClear = false; // cleared manually so overlays can draw on top

    const viewDistance = renderDistance * CHUNK_SIZE;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, viewDistance * 1.5);
    this.camera.rotation.order = 'YXZ';

    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, viewDistance * 0.6, viewDistance);

    const disc = (size: number, color: number) =>
      new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, fog: false }));
    this.sun = disc(28, 0xfff1a8);
    this.moon = disc(18, 0xe4ebf5);
    this.stars = this.createStars();
    this.sky.add(this.sun, this.moon, this.stars);
    this.scene.add(this.sky);

    this.atlasCanvas = createAtlasCanvas();
    this.chunkMaterial = new THREE.MeshBasicMaterial({
      map: createAtlasTexture(this.atlasCanvas),
      vertexColors: true,
      alphaTest: 0.5, // leaves and glass are cut out, no sorting needed
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Sky colour, fog, sun/moon position and the darkening of the world at night. */
  setTimeOfDay(cycle: DayNight): void {
    this.skyColor.setRGB(...skyColorAt(cycle.time), THREE.SRGBColorSpace);
    (this.scene.background as THREE.Color).copy(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.chunkMaterial.color.setScalar(cycle.brightness);

    this.sky.position.copy(this.camera.position);
    // The sun rises in the east (+X), the moon is opposite.
    const angle = cycle.time * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.25).normalize();
    this.sun.position.copy(dir).multiplyScalar(SKY_RADIUS);
    this.moon.position.copy(dir).multiplyScalar(-SKY_RADIUS);
    this.sun.lookAt(this.camera.position);
    this.moon.lookAt(this.camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = 1 - cycle.daylight;
    this.stars.visible = cycle.daylight < 0.95;
  }

  get aspect(): number {
    return this.camera.aspect;
  }

  /** Draws the world, then `overlay` (e.g. the first-person arm) over it with a fresh depth buffer. */
  render(overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    this.webgl.clear();
    this.webgl.render(this.scene, this.camera);
    if (!overlay) return;
    this.webgl.clearDepth();
    this.webgl.render(overlay.scene, overlay.camera);
  }

  private createStars(): THREE.Points {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform on the upper part of a sphere.
      const y = Math.random() * 1.1 - 0.1;
      const r = Math.sqrt(1 - y * y);
      const a = Math.random() * Math.PI * 2;
      positions.set([Math.cos(a) * r * SKY_RADIUS, y * SKY_RADIUS, Math.sin(a) * r * SKY_RADIUS], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    return new THREE.Points(geometry, material);
  }

  private resize(): void {
    const { innerWidth: w, innerHeight: h } = window;
    this.webgl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
