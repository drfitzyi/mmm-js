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
   * Spectral fingerprint disruption settings, or null for metadata-only.
   * `null` means a lossless tag strip with no audio re-encode; any non-null
   * value decodes → modifies → re-encodes (and so also drops metadata).
   */
  spectral: SpectralSettings | null;
}

export const MODES: Record<ModeName, Mode> = {
  metadata: {
    name: 'metadata',
    label: 'Metadata only (lossless)',
    description: 'Strip tags and ancillary chunks, keeping the audio bit-for-bit. No re-encode.',
    spectral: null,
  },
  turbo: {
    name: 'turbo',
    label: 'Turbo (fast)',
    description: 'Light spectral disruption at a small FFT size — quickest lossy pass.',
    spectral: { intensity: 0.18, fftSize: 1024, passes: 1 },
  },
  standard: {
    name: 'standard',
    label: 'Standard',
    description: 'Balanced spectral fingerprint disruption.',
    spectral: { intensity: 0.32, fftSize: 2048, passes: 1 },
  },
  paranoid: {
    name: 'paranoid',
    label: 'Paranoid (maximum)',
    description: 'Aggressive multi-pass disruption at a large FFT size.',
    spectral: { intensity: 0.85, fftSize: 4096, passes: 2 },
  },
};

export const MODE_ORDER: ModeName[] = ['metadata', 'turbo', 'standard', 'paranoid'];

export function isModeName(value: string): value is ModeName {
  return value in MODES;
}
