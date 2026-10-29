import type { MeshData } from '../world/meshing/mesher';

export type WorkerRequest =
  | { type: 'generate'; id: number; seed: string; cx: number; cz: number }
  | { type: 'mesh'; id: number; padded: Uint8Array };

export type WorkerResponse =
  | { type: 'generate'; id: number; blocks: Uint8Array }
  | { type: 'mesh'; id: number; mesh: MeshData };
