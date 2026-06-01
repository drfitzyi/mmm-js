import { processStft } from './stft';
import type { SpectralTransform } from './stft';
import { createRng } from './prng';

export interface HfAttenuation {
  fromHz: number;
  toHz: number;
  /** Linear gain applied within the band (e.g. 0.1 = −20 dB). */
  gain: number;
}

export interface SpectralCleanerOptions {
  /** FFT size (power of two). Larger = finer frequency resolution. */
  fftSize?: number;
  /** Hop between frames. Defaults to fftSize/4 (75% overlap). */
  hop?: number;
  /**
   * Magnitude/phase jitter strength, 0..1. Scales the small per-bin magnitude
   * and phase nudge. Subtle on its own (does not move fingerprint peaks).
   */
  intensity?: number;
  /**
   * Phase randomization amount, 0..1. 0 = none; 1 = fully random phase (very
   * audible, destroys transients). Far stronger than `intensity`'s phase jitter.
   */
  phaseRandom?: number;
  /** Zero out spectral content below this frequency (Hz). Requires sampleRate. */
  highpassHz?: number;
  /** Zero out spectral content above this frequency (Hz). Requires sampleRate. */
  lowpassHz?: number;
  /** Attenuate narrow bands around these frequencies (Hz) — e.g. sync tones. */
  notchHz?: number[];
  /** Attenuate a high-frequency band where watermarks often hide. */
  hfAttenuate?: HfAttenuation;
  /** Sample rate — required for any Hz-based operation (band-limit/notch/HF). */
  sampleRate?: number;
  /** Seed for the jitter PRNG so results are reproducible. */
  seed?: number;
  /** Progress callback, called with a 0..1 ratio during processing. */
  onProgress?: (ratio: number) => void;
}

const DEFAULTS = { fftSize: 2048, intensity: 0.2, seed: 0x9e3779b9 } as const;
const NOTCH_GAIN = 0.08;

function hasFrequencyOps(o: SpectralCleanerOptions): boolean {
  return Boolean(
    o.highpassHz || o.lowpassHz || (o.notchHz && o.notchHz.length > 0) || o.hfAttenuate
  );
}

/**
 * Disrupt acoustic fingerprints and remove suspected watermark content in the
 * STFT domain. Combines (any of):
 *  - bounded magnitude/phase jitter (`intensity`),
 *  - phase randomization (`phaseRandom`),
 *  - band-limiting (`highpassHz`/`lowpassHz`),
 *  - sync-tone notches (`notchHz`) and a high-frequency attenuation band.
 *
 * Edits are applied symmetrically (bin k and mirror n-k stay conjugate) so the
 * resynthesized signal stays real.
 */
export function spectralClean(
  input: Float32Array,
  options: SpectralCleanerOptions = {}
): Float32Array {
  const fftSize = options.fftSize ?? DEFAULTS.fftSize;
  const hop = options.hop ?? fftSize / 4;
  const intensity = clamp(options.intensity ?? DEFAULTS.intensity, 0, 1);
  const phaseRandom = clamp(options.phaseRandom ?? 0, 0, 1);

  const hasWork = intensity > 0 || phaseRandom > 0 || hasFrequencyOps(options);
  if (!hasWork) return input.slice();

  const transform = makeTransform(fftSize, intensity, phaseRandom, options);
  return processStft(input, { fftSize, hop }, transform, options.onProgress);
}

function makeTransform(
  fftSize: number,
  intensity: number,
  phaseRandom: number,
  options: SpectralCleanerOptions
): SpectralTransform {
  const magAmount = 0.06 * intensity;
  const phaseAmount = 0.15 * intensity;
  const half = fftSize >> 1;
  const seed = options.seed ?? DEFAULTS.seed;

  const sampleRate = options.sampleRate ?? 0;
  const binWidth = sampleRate > 0 ? sampleRate / fftSize : 0;
  const freqOps = binWidth > 0 && hasFrequencyOps(options);
  const { highpassHz = 0, lowpassHz = 0, notchHz = [], hfAttenuate } = options;

  // Gain to apply to a bin at frequency `hz` from the band-limit/notch/HF rules.
  const bandGain = (hz: number): number => {
    if (!freqOps) return 1;
    if (highpassHz > 0 && hz < highpassHz) return 0;
    if (lowpassHz > 0 && hz > lowpassHz) return 0;
    let g = 1;
    if (hfAttenuate && hz >= hfAttenuate.fromHz && hz <= hfAttenuate.toHz) g *= hfAttenuate.gain;
    for (const n of notchHz) {
      // ±1.5 bins covers the windowed main lobe of a tone at the notch frequency.
      if (Math.abs(hz - n) <= binWidth * 1.5) g *= NOTCH_GAIN;
    }
    return g;
  };

  return (re, im, frame) => {
    // Re-seed per frame so the jitter pattern varies over time but is repeatable.
    const rng = createRng((seed ^ Math.imul(frame + 1, 0x85ebca6b)) >>> 0);

    // DC and Nyquist are real-only; band-limit can still zero them.
    if (freqOps) {
      if (bandGain(0) === 0) {
        re[0] = 0;
        im[0] = 0;
      }
      if (bandGain(half * binWidth) === 0) {
        re[half] = 0;
        im[half] = 0;
      }
    }

    for (let k = 1; k < half; k++) {
      const reK = re[k]!;
      const imK = im[k]!;
      let mag = Math.hypot(reK, imK);
      if (mag === 0) continue;
      let phase = Math.atan2(imK, reK);

      if (freqOps) mag *= bandGain(k * binWidth);
      mag *= 1 + magAmount * rng.nextSigned();
      phase += phaseAmount * rng.nextSigned() + phaseRandom * Math.PI * rng.nextSigned();

      const nr = mag * Math.cos(phase);
      const ni = mag * Math.sin(phase);
      re[k] = nr;
      im[k] = ni;
      // Mirror bin keeps Hermitian symmetry → real output.
      re[fftSize - k] = nr;
      im[fftSize - k] = -ni;
    }
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
