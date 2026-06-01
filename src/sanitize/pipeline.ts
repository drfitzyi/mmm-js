import { detectFormat, parseAudio, metadataByteCount, readWavSampleRate } from '../audio';
import type { AudioFormat } from '../audio';
import { stripMetadata } from './metadata';
import { cleanWavSpectra, analyzeWavWatermarks } from './spectral';
import { MODES } from '../modes';
import type { ModeName, SpectralSettings } from '../modes';
import type { WatermarkAnalysis } from '../dsp/watermark';

/**
 * Strategy for running the heavy DSP. The default runs in-process (used by
 * tests and as a fallback); the UI injects a Web Worker-backed runner so the
 * main thread stays responsive.
 */
export interface DspRunner {
  clean(
    wav: Uint8Array,
    settings: SpectralSettings,
    opts: { seed?: number; onProgress?: (ratio: number) => void }
  ): Promise<Uint8Array>;
  analyze(wav: Uint8Array): Promise<WatermarkAnalysis[]>;
}

const inProcessRunner: DspRunner = {
  clean: (wav, settings, opts) =>
    Promise.resolve(
      cleanWavSpectra(wav, { ...settings, seed: opts.seed, onProgress: opts.onProgress })
    ),
  analyze: (wav) => Promise.resolve(analyzeWavWatermarks(wav)),
};

/**
 * The codec operations that require ffmpeg.wasm (browser-only). Injectable so
 * the pipeline's orchestration can be tested in Node with a stub.
 */
export interface Codec {
  decodeToWav(input: Uint8Array, name: string): Promise<Uint8Array>;
  encodeMp3(wav: Uint8Array, quality: number): Promise<Uint8Array>;
  warpToWav(
    wav: Uint8Array,
    sampleRate: number,
    pitchRatio: number,
    tempoRatio: number
  ): Promise<Uint8Array>;
  warpToMp3(
    wav: Uint8Array,
    sampleRate: number,
    pitchRatio: number,
    tempoRatio: number,
    quality: number
  ): Promise<Uint8Array>;
}

// Default codec: lazily import ffmpeg.wasm so its ~30 MB core stays out of the
// initial bundle and is only fetched when a lossy mode actually runs.
const ffmpegCodec: Codec = {
  decodeToWav: async (input, name) => (await import('../audio/ffmpeg')).decodeToWav(input, name),
  encodeMp3: async (wav, quality) => (await import('../audio/ffmpeg')).encodeMp3(wav, quality),
  warpToWav: async (wav, sampleRate, pitchRatio, tempoRatio) =>
    (await import('../audio/ffmpeg')).warpToWav(wav, sampleRate, pitchRatio, tempoRatio),
  warpToMp3: async (wav, sampleRate, pitchRatio, tempoRatio, quality) =>
    (await import('../audio/ffmpeg')).warpToMp3(wav, sampleRate, pitchRatio, tempoRatio, quality),
};

export interface PipelineOptions {
  /** Base seed for spectral jitter (reproducible output). */
  seed?: number;
  /** libmp3lame quality for MP3 output (0 best … 9). */
  mp3Quality?: number;
  /** DSP progress, 0..1. */
  onProgress?: (ratio: number) => void;
}

export interface RemovedRegion {
  label: string;
  length: number;
}

export interface ForensicReport {
  mode: ModeName;
  inputFormat: AudioFormat;
  inputSize: number;
  outputFormat: AudioFormat;
  outputSize: number;
  /** True only when the audio is preserved bit-for-bit (metadata-only mode). */
  lossless: boolean;
  metadata: {
    removed: RemovedRegion[];
    bytesRemoved: number;
  };
  /** Pitch shift applied, in percent (0 = none). The primary fingerprint-breaker. */
  pitchPercent: number;
  /** Tempo change applied, in percent (0 = none, negative = slower). */
  tempoPercent: number;
  /** Extra spectral surgery/perturbation applied, or null. */
  spectral: SpectralSettings | null;
  /** Per-channel watermark analysis of the input (lossy modes only). */
  watermarksBefore: WatermarkAnalysis[];
  verification: {
    /** Metadata bytes still present in the output (should be 0). */
    residualMetadataBytes: number;
    /** Whether the audio payload is provably unchanged (lossless mode only). */
    audioPreserved: boolean | 'n/a';
    passed: boolean;
    notes: string[];
  };
}

export interface ProcessOutput {
  bytes: Uint8Array;
  outputFormat: AudioFormat;
  report: ForensicReport;
}

/**
 * Process a file according to a named mode, returning the output and a forensic
 * report (what changed + a re-parse verification).
 *
 * - `metadata`: lossless tag strip, no re-encode.
 * - lossy modes: decode (MP3) → optional spectral perturbation → pitch shift →
 *   re-encode, then a lossless metadata strip on the result so the output is
 *   guaranteed tag-free regardless of what ffmpeg wrote.
 *
 * The pitch shift is the actual acoustic-fingerprint breaker; the spectral
 * perturbation is a subtle extra.
 *
 * @throws on unsupported input.
 */
export async function processWithMode(
  bytes: Uint8Array,
  modeName: ModeName,
  options: PipelineOptions = {},
  runner: DspRunner = inProcessRunner,
  codec: Codec = ffmpegCodec
): Promise<ProcessOutput> {
  const mode = MODES[modeName];
  const format = detectFormat(bytes);
  if (!format) throw new Error('Unsupported file: expected an MP3 or WAV');

  const inputMetaRegions = parseAudio(bytes)
    .regions.filter((r) => r.kind === 'metadata')
    .map((r) => ({ label: r.label, length: r.length }));
  const inputMetaBytes = inputMetaRegions.reduce((sum, r) => sum + r.length, 0);

  const isLossless = !mode.spectral && mode.pitchPercent === 0;

  // --- Lossless metadata-only mode -----------------------------------------
  if (isLossless) {
    const strip = stripMetadata(bytes);
    const residual = metadataByteCount(parseAudio(strip.bytes));
    return {
      bytes: strip.bytes,
      outputFormat: format,
      report: {
        mode: modeName,
        inputFormat: format,
        inputSize: bytes.length,
        outputFormat: format,
        outputSize: strip.bytes.length,
        lossless: true,
        metadata: {
          removed: strip.removed.map((r) => ({ label: r.label, length: r.length })),
          bytesRemoved: strip.bytesRemoved,
        },
        pitchPercent: 0,
        tempoPercent: 0,
        spectral: null,
        watermarksBefore: [],
        verification: {
          residualMetadataBytes: residual,
          audioPreserved: true,
          passed: residual === 0,
          notes:
            residual === 0
              ? ['Output contains no residual metadata.']
              : [`Output still has ${residual} bytes of metadata.`],
        },
      },
    };
  }

  // --- Lossy modes (pitch/tempo warp, optional spectral surgery) -----------
  const quality = options.mp3Quality ?? 2;
  const pitchRatio = 1 + mode.pitchPercent / 100;
  const tempoRatio = 1 + mode.tempoPercent / 100;
  const hasWarp = mode.pitchPercent !== 0 || mode.tempoPercent !== 0;

  // A WAV representation to analyse and process.
  const wav = format === 'wav' ? bytes : await codec.decodeToWav(bytes, 'input.mp3');
  const sampleRate = readWavSampleRate(wav);
  const watermarksBefore = await runner.analyze(wav);

  const perturbed = mode.spectral
    ? await runner.clean(wav, mode.spectral, { seed: options.seed, onProgress: options.onProgress })
    : wav;

  // Pitch/tempo warp (and, for MP3, encode) via the codec.
  let raw: Uint8Array;
  if (format === 'wav') {
    raw = hasWarp
      ? await codec.warpToWav(perturbed, sampleRate, pitchRatio, tempoRatio)
      : perturbed;
  } else {
    raw = hasWarp
      ? await codec.warpToMp3(perturbed, sampleRate, pitchRatio, tempoRatio, quality)
      : await codec.encodeMp3(perturbed, quality);
  }

  // Guarantee a tag-free output regardless of what the encoder wrote.
  const outBytes = stripMetadata(raw).bytes;
  const residual = metadataByteCount(parseAudio(outBytes));

  const notes: string[] = [];
  if (mode.pitchPercent !== 0) notes.push(`Pitch shifted ~${mode.pitchPercent}%.`);
  if (mode.tempoPercent !== 0) notes.push(`Tempo changed ~${mode.tempoPercent}%.`);
  if (mode.spectral) notes.push('Spectral surgery applied.');
  notes.push(
    residual === 0 ? 'Output is metadata-free.' : `Output still has ${residual} bytes of metadata.`
  );
  if (format === 'mp3') notes.push('MP3 re-encode is lossy.');

  return {
    bytes: outBytes,
    outputFormat: format,
    report: {
      mode: modeName,
      inputFormat: format,
      inputSize: bytes.length,
      outputFormat: format,
      outputSize: outBytes.length,
      lossless: false,
      metadata: { removed: inputMetaRegions, bytesRemoved: inputMetaBytes },
      pitchPercent: mode.pitchPercent,
      tempoPercent: mode.tempoPercent,
      spectral: mode.spectral,
      watermarksBefore,
      verification: {
        residualMetadataBytes: residual,
        audioPreserved: 'n/a',
        passed: residual === 0,
        notes,
      },
    },
  };
}
