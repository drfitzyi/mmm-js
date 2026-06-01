import { describe, it, expect } from 'vitest';
import { spectralClean } from './spectral';

const SR = 44100;

function tone(freq: number, length: number): Float32Array {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return x;
}

function rms(x: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / (to - from));
}

describe('spectral surgery', () => {
  it('low-pass removes a high tone', () => {
    const x = tone(19000, 8192);
    const y = spectralClean(x, { intensity: 0, sampleRate: SR, lowpassHz: 10000, fftSize: 1024 });
    expect(rms(y, 1024, 7168)).toBeLessThan(rms(x, 1024, 7168) * 0.15);
  });

  it('high-pass removes a low tone', () => {
    const x = tone(100, 8192);
    const y = spectralClean(x, { intensity: 0, sampleRate: SR, highpassHz: 1000, fftSize: 1024 });
    expect(rms(y, 1024, 7168)).toBeLessThan(rms(x, 1024, 7168) * 0.15);
  });

  it('keeps an in-band tone when band-limiting', () => {
    const x = tone(2000, 8192);
    const y = spectralClean(x, {
      intensity: 0,
      sampleRate: SR,
      highpassHz: 20,
      lowpassHz: 18000,
      fftSize: 1024,
    });
    // 2 kHz is inside [20, 18000] → largely preserved.
    expect(rms(y, 1024, 7168)).toBeGreaterThan(rms(x, 1024, 7168) * 0.7);
  });

  it('notch attenuates a tone at the notch frequency', () => {
    const x = tone(1000, 8192);
    const y = spectralClean(x, { intensity: 0, sampleRate: SR, notchHz: [1000], fftSize: 2048 });
    expect(rms(y, 2048, 6144)).toBeLessThan(rms(x, 2048, 6144) * 0.5);
  });

  it('phaseRandom changes the waveform but keeps it finite', () => {
    const x = tone(1000, 4096);
    const y = spectralClean(x, { phaseRandom: 0.9, sampleRate: SR, fftSize: 1024, seed: 7 });
    let maxDiff = 0;
    for (let i = 1024; i < 3072; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(y[i]! - x[i]!));
      expect(Number.isFinite(y[i]!)).toBe(true);
    }
    expect(maxDiff).toBeGreaterThan(0.05);
  });
});
