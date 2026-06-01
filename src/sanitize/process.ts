import { detectFormat } from '../audio';
import { cleanWavSpectra, analyzeWavWatermarks } from './spectral';
import type { SpectralCleanerOptions } from '../dsp/spectral';
import type { WatermarkAnalysis } from '../dsp/watermark';

export interface ProcessOptions extends SpectralCleanerOptions {
  /** libmp3lame quality for MP3 output (0 best … 9). */
  mp3Quality?: number;
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
}

export interface ProcessResult {
  bytes: Uint8Array;
  /** Output container; MP3 input round-trips through a lossy re-encode. */
  outputFormat: 'wav' | 'mp3';
}

/**
 * Format-aware spectral cleaning.
 *
 * - WAV: decoded and re-encoded losslessly in pure TS — no ffmpeg required.
 * - MP3: decoded to PCM and re-encoded with ffmpeg.wasm (lazily loaded). The
 *   re-encode is lossy by nature; the audio is otherwise preserved.
 *
 * @throws on unsupported input.
 */
export async function spectralCleanFile(
  bytes: Uint8Array,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const format = detectFormat(bytes);

  if (format === 'wav') {
    return { bytes: cleanWavSpectra(bytes, options), outputFormat: 'wav' };
  }

  if (format === 'mp3') {
    // Dynamic import keeps the ~30 MB ffmpeg core out of the initial bundle.
    const { decodeToWav, encodeMp3 } = await import('../audio/ffmpeg');
    const bridge = { onLog: options.onLog, onProgress: options.onProgress };
    const wav = await decodeToWav(bytes, 'input.mp3', bridge);
    const cleanedWav = cleanWavSpectra(wav, options);
    const mp3 = await encodeMp3(cleanedWav, options.mp3Quality ?? 2, bridge);
    return { bytes: mp3, outputFormat: 'mp3' };
  }

  throw new Error('Unsupported file: expected an MP3 or WAV');
}

/**
 * Analyse a file for watermarks. WAV is analysed directly; MP3 is decoded to
 * PCM via ffmpeg.wasm first.
 */
export async function analyzeFile(bytes: Uint8Array): Promise<WatermarkAnalysis[]> {
  const format = detectFormat(bytes);
  if (format === 'wav') return analyzeWavWatermarks(bytes);
  if (format === 'mp3') {
    const { decodeToWav } = await import('../audio/ffmpeg');
    return analyzeWavWatermarks(await decodeToWav(bytes, 'input.mp3'));
  }
  throw new Error('Unsupported file: expected an MP3 or WAV');
}
