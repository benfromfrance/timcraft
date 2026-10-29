import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, BLOCKS } from '../world/blocks';
import { shadedBox } from './shadedBox';

const POOL_SIZE = 96;
const PER_BLOCK = 14;
const GRAVITY = 22;
/** Fraction of a tile shown on each particle face (a 4×4-pixel chip of the texture). */
const CHIP = 0.25;

interface Particle {
  mesh: THREE.Mesh;
  uv: THREE.BufferAttribute;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

/**
 * Little textured chips that burst out of a broken block, bounce and fade.
 * A fixed pool recycled round-robin: no allocation while playing.
 */
export class BlockParticles {
  private readonly particles: Particle[] = [];
  /** BoxGeometry's own 0…1 face UVs, remapped onto a chip of the tile for each burst. */
  private readonly baseUv: Float32Array;
  private next = 0;
  private active = 0;

  constructor(scene: THREE.Scene, material: THREE.Material) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const geometry = shadedBox(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
      this.particles.push({
        mesh,
        uv,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
      });
    }
    this.baseUv = Float32Array.from(this.particles[0].uv.array);
  }

  /** Breaks the block at (x, y, z) into chips of its texture. */
  burst(x: number, y: number, z: number, blockId: number): void {
    const def = BLOCKS[blockId];
    if (!def) return;
    for (let n = 0; n < PER_BLOCK; n++) {
      const p = this.particles[this.next];
      this.next = (this.next + 1) % POOL_SIZE;
      if (p.life <= 0) this.active++;

      const ox = Math.random() - 0.5;
      const oy = Math.random() - 0.5;
      const oz = Math.random() - 0.5;
      p.mesh.position.set(x + 0.5 + ox * 0.8, y + 0.5 + oy * 0.8, z + 0.5 + oz * 0.8);
      p.velocity.set(ox * 5, 2.5 + Math.random() * 3, oz * 5);
      p.size = 0.08 + Math.random() * 0.08;
      p.mesh.scale.setScalar(p.size);
      p.mesh.rotation.set(0, Math.random() * Math.PI, 0);
      p.maxLife = p.life = 0.5 + Math.random() * 0.5;
      p.mesh.visible = true;

      // Mostly side texture, some top (grass shows both green and dirt chips).
      const tile = Math.random() < 0.3 ? def.tiles.top : def.tiles.side;
      const u0 = (tile % ATLAS_COLS) / ATLAS_COLS;
      const v0 = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_ROWS;
      const su = Math.floor(Math.random() * 4) * CHIP;
      const sv = Math.floor(Math.random() * 4) * CHIP;
      for (let i = 0; i < p.uv.count; i++) {
        const bu = this.baseUv[i * 2];
        const bv = this.baseUv[i * 2 + 1];
        p.uv.setXY(i, u0 + (su + bu * CHIP) / ATLAS_COLS, v0 + (sv + bv * CHIP) / ATLAS_ROWS);
      }
      p.uv.needsUpdate = true;
    }
  }

  update(dt: number, isSolid: (x: number, y: number, z: number) => boolean): void {
    if (this.active === 0) return;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.active--;
        continue;
      }

      const pos = p.mesh.position;
      const v = p.velocity;
      v.y -= GRAVITY * dt;
      const ny = pos.y + v.y * dt;
      // Lands on the block below: stops falling and slides to a halt.
      if (v.y < 0 && isSolid(Math.floor(pos.x), Math.floor(ny - p.size / 2), Math.floor(pos.z))) {
        v.y = 0;
        v.x *= 0.8;
        v.z *= 0.8;
        pos.y = Math.floor(ny - p.size / 2) + 1 + p.size / 2;
      } else {
        pos.y = ny;
      }
      const nx = pos.x + v.x * dt;
      const nz = pos.z + v.z * dt;
      if (!isSolid(Math.floor(nx), Math.floor(pos.y), Math.floor(pos.z))) pos.x = nx;
      else v.x = 0;
      if (!isSolid(Math.floor(pos.x), Math.floor(pos.y), Math.floor(nz))) pos.z = nz;
      else v.z = 0;

      // Shrink away during the last third of their life.
      p.mesh.scale.setScalar(p.size * Math.min(1, (p.life / p.maxLife) * 3));
    }
  }
}
