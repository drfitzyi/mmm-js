import { describe, it, expect } from 'vitest';
import { processStft } from './stft';
import { cleanWavSpectra } from '../sanitize/spectral';
import { encodeWavPcm } from '../audio/pcm';
import { createRng } from './prng';

function signal(length: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = 0.5 * rng.nextSigned();
  return x;
}

describe('progress reporting', () => {
  it('processStft reports a monotonic 0..1 ratio ending at 1', () => {
    const ratios: number[] = [];
    processStft(
      signal(8192, 1),
      { fftSize: 1024, hop: 256 },
      () => {},
      (r) => ratios.push(r)
    );

    expect(ratios.length).toBeGreaterThan(1);
    expect(ratios.at(-1)).toBe(1);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!);
      expect(ratios[i]!).toBeGreaterThanOrEqual(0);
      expect(ratios[i]!).toBeLessThanOrEqual(1);
    }
  });

  it('cleanWavSpectra aggregates progress across channels and passes', () => {
    const sampleRate = 44100;
    const wav = encodeWavPcm({
      sampleRate,
      channels: [signal(8192, 2), signal(8192, 3)],
    });

    const ratios: number[] = [];
    cleanWavSpectra(wav, {
      fftSize: 1024,
      intensity: 0.3,
      passes: 2,
      onProgress: (r) => ratios.push(r),
    });

    expect(ratios.at(-1)).toBe(1);
    // Should pass through intermediate values, never exceeding 1.
    expect(Math.max(...ratios)).toBeLessThanOrEqual(1);
    expect(ratios.some((r) => r > 0 && r < 1)).toBe(true);
  });
});
