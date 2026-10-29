import * as THREE from 'three';
import { CHUNK_SIZE } from '../world/Chunk';
import { chunkKey } from '../world/coords';
import type { MeshData } from '../world/meshing/mesher';

/** Owns one Three.js mesh per chunk; disposes GPU buffers when replaced or unloaded. */
export class ChunkRenderer {
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly material: THREE.Material,
  ) {}

  get count(): number {
    return this.meshes.size;
  }

  setMesh(cx: number, cz: number, data: MeshData): void {
    this.remove(cx, cz);
    if (data.indices.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.meshes.set(chunkKey(cx, cz), mesh);
  }

  remove(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }
}
