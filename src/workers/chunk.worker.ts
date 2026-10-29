import { TerrainGenerator } from '../world/generation/TerrainGenerator';
import { buildChunkMesh } from '../world/meshing/mesher';
import type { WorkerRequest, WorkerResponse } from './protocol';

let generator: TerrainGenerator | null = null;
let generatorSeed = '';

function reply(response: WorkerResponse, transfer: Transferable[]): void {
  self.postMessage(response, { transfer });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'generate') {
    if (!generator || generatorSeed !== req.seed) {
      generator = new TerrainGenerator(req.seed);
      generatorSeed = req.seed;
    }
    const { blocks } = generator.generate(req.cx, req.cz);
    reply({ type: 'generate', id: req.id, blocks }, [blocks.buffer]);
  } else {
    const mesh = buildChunkMesh(req.padded);
    reply({ type: 'mesh', id: req.id, mesh }, [
      mesh.positions.buffer,
      mesh.uvs.buffer,
      mesh.colors.buffer,
      mesh.indices.buffer,
    ]);
  }
};
