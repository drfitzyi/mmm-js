import { decodeWavPcm, encodeWavPcm } from '../audio/pcm';
import { spectralClean } from '../dsp/spectral';
import type { SpectralCleanerOptions } from '../dsp/spectral';
import { analyzeWatermarks } from '../dsp/watermark';
import type { WatermarkAnalysis } from '../dsp/watermark';

export interface WavCleanOptions extends SpectralCleanerOptions {
  /** Number of spectral passes to apply (in the PCM domain). Default 1. */
  passes?: number;
}

/**
 * Apply spectral fingerprint disruption to a WAV file (pure, no ffmpeg needed).
 * Each channel is jittered with a different seed offset so a stereo pair isn't
 * perturbed identically, and each pass uses a distinct seed so repeated passes
 * compound rather than repeat. All passes run in the PCM domain, so the file is
 * only decoded and re-encoded once regardless of pass count.
 */
export function cleanWavSpectra(wavBytes: Uint8Array, options: WavCleanOptions = {}): Uint8Array {
  const passes = Math.max(1, Math.floor(options.passes ?? 1));
  const baseSeed = options.seed ?? 0x9e3779b9;
  const pcm = decodeWavPcm(wavBytes);

  const channels = pcm.channels.map((channel, index) => {
    let current = channel;
    for (let pass = 0; pass < passes; pass++) {
      const seed = (baseSeed + index * 7919 + pass * 104729) >>> 0;
      current = spectralClean(current, { ...options, seed });
    }
    return current;
  });

  return encodeWavPcm({ sampleRate: pcm.sampleRate, channels });
}

/** Run watermark analysis on every channel of a WAV file. */
export function analyzeWavWatermarks(wavBytes: Uint8Array): WatermarkAnalysis[] {
  const pcm = decodeWavPcm(wavBytes);
  return pcm.channels.map((channel) => analyzeWatermarks(channel, pcm.sampleRate));
}
