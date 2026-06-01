// Processing-mode presets, mirroring upstream mmm's standard/turbo/paranoid
// modes plus a lossless metadata-only mode.

export type ModeName = 'metadata' | 'turbo' | 'standard' | 'paranoid';

export interface SpectralSettings {
  /** SpectralCleaner magnitude/phase jitter, 0..1. */
  intensity: number;
  /** FFT size (power of two). Larger = finer resolution, slower. */
  fftSize: number;
  /** Number of spectral passes (applied in the PCM domain). */
  passes: number;
  /** Phase randomization amount, 0..1 (0 = none, 1 = fully random/very audible). */
  phaseRandom?: number;
  /** Zero spectral content below this frequency (Hz). */
  highpassHz?: number;
  /** Zero spectral content above this frequency (Hz). */
  lowpassHz?: number;
  /** Attenuate narrow bands around these frequencies (Hz) — common sync tones. */
  notchHz?: number[];
  /** Attenuate a high-frequency band where watermarks often hide. */
  hfAttenuate?: { fromHz: number; toHz: number; gain: number };
}

// Sync-reference tones upstream mmm notches out (Hz).
const SYNC_TONES = [1000, 2000, 3000, 4000, 5000, 10000, 15000];

export interface Mode {
  name: ModeName;
  // Display label/description live in src/i18n.ts under `mode.<name>.label`/`.desc`.
  /**
   * Pitch shift, in percent (0 = none). The primary fingerprint-breaker:
   * recognition keys on spectral-peak positions and a pitch shift moves all of
   * them. Audible as a key change; requires a re-encode (ffmpeg).
   */
  pitchPercent: number;
  /**
   * Tempo change, in percent (0 = none, negative = slower). A second
   * recognition-breaker that alters the time-frequency geometry. Audible.
   */
  tempoPercent: number;
  /**
   * Optional extra spectral surgery/perturbation (band-limit, sync-tone notches,
   * HF attenuation, jitter, phase randomization), in addition to the warp.
   */
  spectral: SpectralSettings | null;
}

export const MODES: Record<ModeName, Mode> = {
  metadata: {
    name: 'metadata',
    pitchPercent: 0,
    tempoPercent: 0,
    spectral: null,
  },
  turbo: {
    name: 'turbo',
    pitchPercent: 3,
    tempoPercent: 0,
    spectral: null,
  },
  standard: {
    name: 'standard',
    pitchPercent: 4.5,
    tempoPercent: 0,
    spectral: {
      intensity: 0.2,
      fftSize: 2048,
      passes: 1,
      notchHz: SYNC_TONES,
      hfAttenuate: { fromHz: 18000, toHz: 22000, gain: 0.1 },
    },
  },
  paranoid: {
    name: 'paranoid',
    pitchPercent: 7,
    tempoPercent: -3,
    spectral: {
      intensity: 0.5,
      fftSize: 2048,
      passes: 2,
      phaseRandom: 0.8,
      highpassHz: 20,
      lowpassHz: 18000,
      notchHz: SYNC_TONES,
      hfAttenuate: { fromHz: 18000, toHz: 22000, gain: 0.05 },
    },
  },
};

export const MODE_ORDER: ModeName[] = ['metadata', 'turbo', 'standard', 'paranoid'];

export function isModeName(value: string): value is ModeName {
  return value in MODES;
}
