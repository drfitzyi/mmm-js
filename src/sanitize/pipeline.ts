import { detectFormat, parseAudio, metadataByteCount } from '../audio';
import type { AudioFormat } from '../audio';
import { stripMetadata } from './metadata';
import { cleanWavSpectra, analyzeWavWatermarks } from './spectral';
import { MODES } from '../modes';
import type { ModeName, SpectralSettings } from '../modes';
import type { WatermarkAnalysis } from '../dsp/watermark';

export interface PipelineOptions {
  /** Base seed for spectral jitter (reproducible output). */
  seed?: number;
  /** libmp3lame quality for MP3 output (0 best … 9). */
  mp3Quality?: number;
  onLog?: (message: string) => void;
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
  /** True only for the metadata-only mode (audio preserved bit-for-bit). */
  lossless: boolean;
  metadata: {
    removed: RemovedRegion[];
    bytesRemoved: number;
  };
  /** Spectral parameters applied, or null for metadata-only. */
  spectral: SpectralSettings | null;
  /** Per-channel watermark analysis of the input (spectral modes only). */
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
 * Process a file according to a named mode and return the output plus a forensic
 * report describing what changed and the result of re-parsing the output.
 *
 * - `metadata`: lossless tag strip, no re-encode.
 * - spectral modes: decode → spectral clean → re-encode (WAV in pure TS, MP3 via
 *   ffmpeg.wasm). Re-encoding inherently drops container metadata.
 *
 * @throws on unsupported input.
 */
export async function processWithMode(
  bytes: Uint8Array,
  modeName: ModeName,
  options: PipelineOptions = {}
): Promise<ProcessOutput> {
  const mode = MODES[modeName];
  const format = detectFormat(bytes);
  if (!format) throw new Error('Unsupported file: expected an MP3 or WAV');

  const inputMetaRegions = parseAudio(bytes)
    .regions.filter((r) => r.kind === 'metadata')
    .map((r) => ({ label: r.label, length: r.length }));
  const inputMetaBytes = inputMetaRegions.reduce((sum, r) => sum + r.length, 0);

  // --- Lossless metadata-only mode -----------------------------------------
  if (!mode.spectral) {
    const strip = stripMetadata(bytes);
    const residual = metadataByteCount(parseAudio(strip.bytes));
    const notes: string[] = [];
    if (residual === 0) notes.push('Output contains no residual metadata.');
    else notes.push(`Output still has ${residual} bytes of metadata.`);
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
        spectral: null,
        watermarksBefore: [],
        verification: {
          residualMetadataBytes: residual,
          audioPreserved: true,
          passed: residual === 0,
          notes,
        },
      },
    };
  }

  // --- Spectral modes -------------------------------------------------------
  const bridge = { onLog: options.onLog, onProgress: options.onProgress };

  // Get a WAV representation to analyse and process.
  let wav: Uint8Array;
  if (format === 'wav') {
    wav = bytes;
  } else {
    const { decodeToWav } = await import('../audio/ffmpeg');
    wav = await decodeToWav(bytes, 'input.mp3', bridge);
  }

  const watermarksBefore = analyzeWavWatermarks(wav);
  const cleanedWav = cleanWavSpectra(wav, {
    intensity: mode.spectral.intensity,
    fftSize: mode.spectral.fftSize,
    passes: mode.spectral.passes,
    seed: options.seed,
  });

  let outBytes: Uint8Array;
  if (format === 'wav') {
    outBytes = cleanedWav;
  } else {
    const { encodeMp3 } = await import('../audio/ffmpeg');
    outBytes = await encodeMp3(cleanedWav, options.mp3Quality ?? 2, bridge);
  }

  const residual = metadataByteCount(parseAudio(outBytes));
  const notes: string[] = [];
  notes.push(
    residual === 0
      ? 'Re-encode dropped all container metadata.'
      : `Output still has ${residual} bytes of metadata.`
  );
  if (format === 'mp3') notes.push('MP3 re-encode is lossy by nature.');

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
