import { describe, it, expect } from 'vitest';
import { fft, magnitudes } from './fft';
import { createRng } from './prng';

function naiveDft(re: number[]): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      outRe[k] = outRe[k]! + re[t]! * Math.cos(ang);
      outIm[k] = outIm[k]! + re[t]! * Math.sin(ang);
    }
  }
  return { re: outRe, im: outIm };
}

describe('fft', () => {
  it('matches a naive DFT on random input', () => {
    const rng = createRng(1);
    const input = Array.from({ length: 16 }, () => rng.nextSigned());
    const re = Float64Array.from(input);
    const im = new Float64Array(16);
    fft(re, im);
    const ref = naiveDft(input);
    for (let k = 0; k < 16; k++) {
      expect(re[k]).toBeCloseTo(ref.re[k]!, 6);
      expect(im[k]).toBeCloseTo(ref.im[k]!, 6);
    }
  });

  it('round-trips through inverse FFT', () => {
    const rng = createRng(42);
    const original = Float64Array.from({ length: 64 }, () => rng.nextSigned());
    const re = Float64Array.from(original);
    const im = new Float64Array(64);
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < 64; i++) {
      expect(re[i]).toBeCloseTo(original[i]!, 9);
      expect(im[i]).toBeCloseTo(0, 9);
    }
  });

  it('puts a pure cosine in a single magnitude bin', () => {
    const n = 32;
    const bin = 4;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let t = 0; t < n; t++) re[t] = Math.cos((2 * Math.PI * bin * t) / n);
    fft(re, im);
    const mag = magnitudes(re, im);
    // Energy concentrates at bin and its mirror (n - bin); others ~0.
    expect(mag[bin]).toBeCloseTo(n / 2, 6);
    expect(mag[n - bin]).toBeCloseTo(n / 2, 6);
    expect(mag[bin + 1]).toBeCloseTo(0, 6);
  });

  it('rejects non-power-of-two lengths', () => {
    expect(() => fft(new Float64Array(3), new Float64Array(3))).toThrow(/power of two/);
  });
});
