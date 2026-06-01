/// <reference lib="webworker" />
// DSP worker: runs the heavy pure-DSP work (spectral cleaning, watermark
// analysis) off the main thread so the UI stays responsive. Only operates on
// WAV bytes — MP3 decode/encode (ffmpeg, which has its own worker) is
// orchestrated on the main thread.
import { cleanWavSpectra, analyzeWavWatermarks } from '../sanitize/spectral';
import type { DspRequest, DspResponse } from './messages';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: DspResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

ctx.onmessage = (event: MessageEvent<DspRequest>): void => {
  const req = event.data;
  try {
    if (req.type === 'clean') {
      const cleaned = cleanWavSpectra(new Uint8Array(req.wav), {
        ...req.settings,
        seed: req.seed,
        onProgress: (ratio) => post({ id: req.id, type: 'progress', ratio }),
      });
      const buffer = cleaned.buffer as ArrayBuffer;
      post({ id: req.id, type: 'clean-result', wav: buffer }, [buffer]);
    } else {
      const analyses = analyzeWavWatermarks(new Uint8Array(req.wav));
      post({ id: req.id, type: 'analyze-result', analyses });
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
