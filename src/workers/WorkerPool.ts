import type { MeshData } from '../world/meshing/mesher';
import ChunkWorker from './chunk.worker?worker';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Resolver = (response: WorkerResponse) => void;

/** Round-robin pool of chunk workers with a promise-based API. */
export class WorkerPool {
  readonly size: number;
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, Resolver>();
  private nextWorker = 0;
  private nextId = 1;

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1))) {
    this.size = size;
    for (let i = 0; i < size; i++) {
      const worker = new ChunkWorker();
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const resolve = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        resolve?.(event.data);
      };
      this.workers.push(worker);
    }
  }

  generate(seed: string, cx: number, cz: number): Promise<Uint8Array> {
    return this.send({ type: 'generate', id: this.nextId++, seed, cx, cz }, []).then((r) =>
      r.type === 'generate' ? r.blocks : Promise.reject(new Error('unexpected response')),
    );
  }

  mesh(padded: Uint8Array): Promise<MeshData> {
    return this.send({ type: 'mesh', id: this.nextId++, padded }, [padded.buffer]).then((r) =>
      r.type === 'mesh' ? r.mesh : Promise.reject(new Error('unexpected response')),
    );
  }

  private send(request: WorkerRequest, transfer: Transferable[]): Promise<WorkerResponse> {
    return new Promise((resolve) => {
      this.pending.set(request.id, resolve);
      const worker = this.workers[this.nextWorker];
      this.nextWorker = (this.nextWorker + 1) % this.size;
      worker.postMessage(request, transfer);
    });
  }
}
