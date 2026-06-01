import { decodeWavPcm, encodeWavPcm } from '../audio/pcm';
import { spectralClean } from '../dsp/spectral';
import type { SpectralCleanerOptions } from '../dsp/spectral';
import { analyzeWatermarks } from '../dsp/watermark';
import type { WatermarkAnalysis } from '../dsp/watermark';

/**
 * Apply spectral fingerprint disruption to a WAV file (pure, no ffmpeg needed).
 * Each channel is jittered with a different seed offset so a stereo pair isn't
 * perturbed identically.
 */
export function cleanWavSpectra(
  wavBytes: Uint8Array,
  options: SpectralCleanerOptions = {}
): Uint8Array {
  const pcm = decodeWavPcm(wavBytes);
  const baseSeed = options.seed ?? 0x9e3779b9;
  const channels = pcm.channels.map((channel, index) =>
    spectralClean(channel, { ...options, seed: (baseSeed + index * 7919) >>> 0 })
  );
  return encodeWavPcm({ sampleRate: pcm.sampleRate, channels });
}

/** Run watermark analysis on every channel of a WAV file. */
export function analyzeWavWatermarks(wavBytes: Uint8Array): WatermarkAnalysis[] {
  const pcm = decodeWavPcm(wavBytes);
  return pcm.channels.map((channel) => analyzeWatermarks(channel, pcm.sampleRate));
}
