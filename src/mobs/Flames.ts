import * as THREE from 'three';

const PARTICLES = 12;
const RISE_SPEED = 1.3;

// Shared by every mob: never disposed with a model (see `userData.shared`).
const geometry = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const materials = [0xffd34a, 0xff8a1f, 0xe8401a].map(
  (color) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
);

interface Particle {
  mesh: THREE.Mesh;
  life: number;
  speed: number;
}

/** Fire licking around a mob's body; `intensity` 0 hides it, 1 is fully ablaze. */
export class Flames {
  readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.group.userData.shared = true;
    for (let i = 0; i < PARTICLES; i++) {
      const mesh = new THREE.Mesh(geometry, materials[i % materials.length]);
      mesh.userData.shared = true;
      const particle = { mesh, life: Math.random(), speed: 0.6 + Math.random() * 0.8 };
      this.respawn(particle);
      this.group.add(mesh);
      this.particles.push(particle);
    }
  }

  update(dt: number, intensity: number): void {
    this.group.visible = intensity > 0.02;
    if (!this.group.visible) return;
    for (const p of this.particles) {
      p.life += dt * p.speed;
      if (p.life >= 1) {
        p.life = 0;
        this.respawn(p);
      }
      p.mesh.position.y += dt * RISE_SPEED * p.speed;
      // Grow quickly, then shrink while rising.
      p.mesh.scale.setScalar(Math.sin(p.life * Math.PI) * intensity * 1.4 + 0.001);
      p.mesh.rotation.y += dt * 2;
    }
  }

  private respawn(p: Particle): void {
    p.mesh.position.set(
      (Math.random() - 0.5) * this.width,
      Math.random() * this.height * 0.75,
      (Math.random() - 0.5) * this.width,
    );
  }
}
