// Main-thread client for the DSP worker. Promise-based, with progress callbacks
// and cancellation (via worker termination, since GitHub Pages has no
// SharedArrayBuffer for a cooperative cancel flag). Implements the pipeline's
// DspRunner interface.
import type { SpectralSettings } from '../modes';
import type { WatermarkAnalysis } from '../dsp/watermark';
import type { DspRequest, DspResponse } from './messages';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (ratio: number) => void;
}

// Omit applied across each member of a union (plain Omit collapses to the
// common properties, dropping per-variant fields like `settings`).
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class DspWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<DspResponse>) => this.onMessage(e.data);
      this.worker.onerror = () => this.failAll(new Error('DSP worker crashed'));
    }
    return this.worker;
  }

  private onMessage(msg: DspResponse): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    if (msg.type === 'progress') {
      pending.onProgress?.(msg.ratio);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.type === 'error') pending.reject(new Error(msg.message));
    else if (msg.type === 'clean-result') pending.resolve(new Uint8Array(msg.wav));
    else pending.resolve(msg.analyses);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  /** Terminate the worker and reject any in-flight work. The next call respawns it. */
  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.failAll(new Error('Cancelled'));
  }

  clean(
    wav: Uint8Array,
    settings: SpectralSettings,
    opts: { seed?: number; onProgress?: (ratio: number) => void } = {}
  ): Promise<Uint8Array> {
    // Copy before transfer so the caller's bytes are not detached.
    const copy = wav.slice();
    const buffer = copy.buffer as ArrayBuffer;
    return this.request<Uint8Array>(
      { type: 'clean', wav: buffer, settings, seed: opts.seed },
      [buffer],
      opts.onProgress
    );
  }

  analyze(wav: Uint8Array): Promise<WatermarkAnalysis[]> {
    const copy = wav.slice();
    const buffer = copy.buffer as ArrayBuffer;
    return this.request<WatermarkAnalysis[]>({ type: 'analyze', wav: buffer }, [buffer]);
  }

  private request<T>(
    payload: DistributiveOmit<DspRequest, 'id'>,
    transfer: Transferable[],
    onProgress?: (ratio: number) => void
  ): Promise<T> {
    const id = this.nextId++;
    const worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      worker.postMessage({ ...payload, id } as DspRequest, transfer);
    });
  }
}
