import { describe, it, expect } from 'vitest';
import { processStft } from './stft';
import { createRng } from './prng';

function makeSignal(length: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // A couple of tones plus a little noise.
    x[i] =
      0.5 * Math.sin((2 * Math.PI * 440 * i) / 8000) +
      0.3 * Math.sin((2 * Math.PI * 1000 * i) / 8000) +
      0.05 * rng.nextSigned();
  }
  return x;
}

describe('processStft', () => {
  it('reconstructs the interior of the signal under an identity transform', () => {
    const x = makeSignal(4096, 7);
    const y = processStft(x, { fftSize: 1024, hop: 256 }, () => {});

    // Ignore the first/last frame where window coverage ramps up.
    let maxErr = 0;
    for (let i = 1024; i < x.length - 1024; i++) {
      maxErr = Math.max(maxErr, Math.abs(y[i]! - x[i]!));
    }
    expect(maxErr).toBeLessThan(1e-4);
  });

  it('returns an output of the same length', () => {
    const x = makeSignal(5000, 3);
    const y = processStft(x, { fftSize: 512, hop: 128 }, () => {});
    expect(y.length).toBe(x.length);
  });

  it('rejects an invalid hop', () => {
    expect(() => processStft(new Float32Array(10), { fftSize: 8, hop: 0 }, () => {})).toThrow();
    expect(() => processStft(new Float32Array(10), { fftSize: 8, hop: 16 }, () => {})).toThrow();
  });
});
