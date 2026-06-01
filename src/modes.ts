// Processing-mode presets, mirroring upstream mmm's standard/turbo/paranoid
// modes plus a lossless metadata-only mode.

export type ModeName = 'metadata' | 'turbo' | 'standard' | 'paranoid';

export interface SpectralSettings {
  /** SpectralCleaner intensity, 0..1. */
  intensity: number;
  /** FFT size (power of two). Larger = finer resolution, slower. */
  fftSize: number;
  /** Number of spectral passes (applied in the PCM domain). */
  passes: number;
}

export interface Mode {
  name: ModeName;
  label: string;
  description: string;
  /**
   * Pitch shift, in percent (0 = none). This is the primary fingerprint-breaker:
   * acoustic recognition keys on spectral-peak positions, and shifting pitch
   * moves all of them. It is audible as a slight key change and requires a
   * re-encode (ffmpeg).
   */
  pitchPercent: number;
  /**
   * Optional extra per-bin spectral perturbation (in addition to the pitch
   * shift). Subtle and not sufficient on its own against robust fingerprinters.
   */
  spectral: SpectralSettings | null;
}

export const MODES: Record<ModeName, Mode> = {
  metadata: {
    name: 'metadata',
    label: 'Metadata only (lossless)',
    description:
      'Strip tags only, keeping the audio bit-for-bit. Does NOT defeat acoustic recognition.',
    pitchPercent: 0,
    spectral: null,
  },
  turbo: {
    name: 'turbo',
    label: 'Turbo (gentle pitch)',
    description: 'A ~3% pitch shift — mildest audible change, may not fool stronger matchers.',
    pitchPercent: 3,
    spectral: null,
  },
  standard: {
    name: 'standard',
    label: 'Standard (pitch shift)',
    description: 'A ~4.5% pitch shift to break fingerprints. Audible as a slight key change.',
    pitchPercent: 4.5,
    spectral: null,
  },
  paranoid: {
    name: 'paranoid',
    label: 'Paranoid (maximum)',
    description: 'A ~7% pitch shift plus spectral perturbation — most disruptive, most audible.',
    pitchPercent: 7,
    spectral: { intensity: 0.5, fftSize: 2048, passes: 1 },
  },
};

export const MODE_ORDER: ModeName[] = ['metadata', 'turbo', 'standard', 'paranoid'];

export function isModeName(value: string): value is ModeName {
  return value in MODES;
}
