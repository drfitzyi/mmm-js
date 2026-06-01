import { fft } from './fft';
import { hannWindow } from './window';

/**
 * A per-frame spectral transform. Receives the complex spectrum of one frame
 * (`re`/`im`, length = fftSize) and the frame index, and mutates it in place.
 * To preserve a real-valued output it should keep Hermitian symmetry
 * (bin k and bin n-k conjugate) — see `src/dsp/spectral.ts` for an example.
 */
export type SpectralTransform = (re: Float64Array, im: Float64Array, frame: number) => void;

export interface StftOptions {
  /** FFT size (power of two). */
  fftSize: number;
  /** Hop between successive frames; fftSize/4 gives 75% overlap (good COLA). */
  hop: number;
}

/**
 * Analyse `input` with an overlapping windowed STFT, apply `transform` to each
 * frame's spectrum, and resynthesize via weighted overlap-add. With an identity
 * transform this reconstructs the input (away from the very edges) to numeric
 * precision, because the output is normalized by the accumulated window energy.
 */
export function processStft(
  input: Float32Array,
  options: StftOptions,
  transform: SpectralTransform
): Float32Array {
  const { fftSize, hop } = options;
  if (hop <= 0 || hop > fftSize) throw new Error('hop must be in (0, fftSize]');
  const win = hannWindow(fftSize);
  const out = new Float32Array(input.length);
  const norm = new Float32Array(input.length);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  let frame = 0;
  for (let start = 0; start < input.length; start += hop, frame++) {
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i;
      const sample = idx < input.length ? input[idx]! : 0;
      re[i] = sample * win[i]!;
      im[i] = 0;
    }

    fft(re, im, false);
    transform(re, im, frame);
    fft(re, im, true);

    for (let i = 0; i < fftSize; i++) {
      const idx = start + i;
      if (idx >= out.length) break;
      const w = win[i]!;
      // Synthesis window again → analysis·synthesis = w² weighting.
      out[idx] = out[idx]! + re[i]! * w;
      norm[idx] = norm[idx]! + w * w;
    }
  }

  for (let i = 0; i < out.length; i++) {
    const denom = norm[i]!;
    if (denom > 1e-6) out[i] = out[i]! / denom;
  }
  return out;
}
