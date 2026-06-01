import { describe, it, expect } from 'vitest';
import { spectralClean } from './spectral';
import { createRng } from './prng';

function makeSignal(length: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    x[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / 44100) + 0.1 * rng.nextSigned();
  }
  return x;
}

function rms(x: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / (to - from));
}

describe('spectralClean', () => {
  it('returns audio of the same length', () => {
    const x = makeSignal(8192, 1);
    const y = spectralClean(x, { fftSize: 1024, intensity: 0.3 });
    expect(y.length).toBe(x.length);
  });

  it('is a no-op at intensity 0 (copy of input)', () => {
    const x = makeSignal(2048, 2);
    const y = spectralClean(x, { intensity: 0 });
    expect(y).toEqual(x);
    expect(y).not.toBe(x); // a copy, not the same reference
  });

  it('measurably alters the signal but preserves rough energy', () => {
    const x = makeSignal(8192, 3);
    const y = spectralClean(x, { fftSize: 1024, intensity: 0.5, seed: 123 });

    // Interior, away from window ramp-up.
    const from = 1024;
    const to = x.length - 1024;
    let maxDiff = 0;
    for (let i = from; i < to; i++) maxDiff = Math.max(maxDiff, Math.abs(y[i]! - x[i]!));
    expect(maxDiff).toBeGreaterThan(1e-3); // it actually changed something

    const energyRatio = rms(y, from, to) / rms(x, from, to);
    expect(energyRatio).toBeGreaterThan(0.7);
    expect(energyRatio).toBeLessThan(1.3);
  });

  it('produces a finite, real-valued (non-NaN) result', () => {
    const x = makeSignal(4096, 4);
    const y = spectralClean(x, { fftSize: 512, intensity: 1 });
    for (let i = 0; i < y.length; i++) expect(Number.isFinite(y[i]!)).toBe(true);
  });

  it('is reproducible for a fixed seed', () => {
    const x = makeSignal(4096, 5);
    const a = spectralClean(x, { fftSize: 512, intensity: 0.4, seed: 99 });
    const b = spectralClean(x, { fftSize: 512, intensity: 0.4, seed: 99 });
    expect(a).toEqual(b);
  });
});
