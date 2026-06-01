import { processStft } from './stft';
import type { SpectralTransform } from './stft';
import { createRng } from './prng';

export interface SpectralCleanerOptions {
  /** FFT size (power of two). Larger = finer frequency resolution. */
  fftSize?: number;
  /** Hop between frames. Defaults to fftSize/4 (75% overlap). */
  hop?: number;
  /**
   * Strength of the modification, 0..1. Scales both the magnitude and phase
   * jitter applied to each bin. 0 is a no-op; ~0.2 is subtle; 1 is aggressive.
   */
  intensity?: number;
  /** Seed for the jitter PRNG so results are reproducible. */
  seed?: number;
}

const DEFAULTS = { fftSize: 2048, intensity: 0.2, seed: 0x9e3779b9 } as const;

/**
 * Disrupt acoustic fingerprints by applying small, randomized per-bin
 * magnitude and phase perturbations in the STFT domain. The perturbation is
 * applied symmetrically (bin k and its mirror n-k stay complex conjugates) so
 * the resynthesized signal remains real-valued, and magnitudes are only ever
 * nudged by a bounded fraction so the audible result stays close to the input.
 */
export function spectralClean(
  input: Float32Array,
  options: SpectralCleanerOptions = {}
): Float32Array {
  const fftSize = options.fftSize ?? DEFAULTS.fftSize;
  const hop = options.hop ?? fftSize / 4;
  const intensity = clamp(options.intensity ?? DEFAULTS.intensity, 0, 1);
  if (intensity === 0) return input.slice();

  const seed = options.seed ?? DEFAULTS.seed;
  const transform = makeJitterTransform(fftSize, intensity, seed);
  return processStft(input, { fftSize, hop }, transform);
}

function makeJitterTransform(fftSize: number, intensity: number, seed: number): SpectralTransform {
  // Up to ±6% magnitude change and ±0.15 rad phase change at full intensity —
  // enough to move a fingerprint hash, small enough to stay perceptually close.
  const magAmount = 0.06 * intensity;
  const phaseAmount = 0.15 * intensity;
  const half = fftSize >> 1;

  return (re, im, frame) => {
    // Re-seed per frame so the jitter pattern varies over time but is repeatable.
    const rng = createRng((seed ^ Math.imul(frame + 1, 0x85ebca6b)) >>> 0);

    for (let k = 1; k < half; k++) {
      const reK = re[k]!;
      const imK = im[k]!;
      const mag = Math.hypot(reK, imK);
      if (mag === 0) continue;
      let phase = Math.atan2(imK, reK);

      const newMag = mag * (1 + magAmount * rng.nextSigned());
      phase += phaseAmount * rng.nextSigned();

      const nr = newMag * Math.cos(phase);
      const ni = newMag * Math.sin(phase);
      re[k] = nr;
      im[k] = ni;
      // Mirror bin keeps Hermitian symmetry → real output.
      re[fftSize - k] = nr;
      im[fftSize - k] = -ni;
    }
    // Leave DC (k=0) and Nyquist (k=half) untouched; they must stay real.
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
