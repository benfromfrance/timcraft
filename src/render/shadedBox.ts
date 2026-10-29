import * as THREE from 'three';

/** Same directional shading as the chunk mesher, in BoxGeometry face order (+x −x +y −y +z −z). */
const FACE_SHADES = [0.8, 0.8, 1, 0.5, 0.65, 0.65];

/**
 * Box with per-face shading baked into vertex colours, to match the unlit voxel look.
 * Use with `MeshBasicMaterial({ vertexColors: true, color })`.
 */
export function shadedBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.fill(FACE_SHADES[Math.floor(i / 4)], i * 3, i * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
