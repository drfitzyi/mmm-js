import { describe, it, expect } from 'vitest';
import {
  detectEcho,
  spectralFlatness,
  analyzeWatermarks,
  statisticalAnomaly,
  highFrequencyProfile,
} from './watermark';
import { createRng } from './prng';

const SAMPLE_RATE = 8000;

function noise(length: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = 0.5 * rng.nextSigned();
  return x;
}

function addEcho(x: Float32Array, delay: number, gain: number): Float32Array {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    y[i] = x[i]! + (i >= delay ? gain * x[i - delay]! : 0);
  }
  return y;
}

describe('detectEcho', () => {
  it('finds a synthetic echo at the correct delay', () => {
    const delay = 400; // 50 ms at 8 kHz
    const echoed = addEcho(noise(16384, 1), delay, 0.6);
    const finding = detectEcho(echoed, SAMPLE_RATE);

    expect(finding.detected).toBe(true);
    expect(finding.lagSamples).toBeGreaterThan(delay - 4);
    expect(finding.lagSamples).toBeLessThan(delay + 4);
    expect(finding.lagMs).toBeCloseTo(50, 0);
  });

  it('stays quiet on clean noise (no echo)', () => {
    const finding = detectEcho(noise(16384, 2), SAMPLE_RATE);
    expect(finding.detected).toBe(false);
  });

  it('returns an empty finding for too-short input', () => {
    expect(detectEcho(new Float32Array(10), SAMPLE_RATE).detected).toBe(false);
  });
});

describe('spectralFlatness', () => {
  it('is high for white noise and low for a pure tone', () => {
    const noiseFlat = spectralFlatness(noise(8192, 3));

    const tone = new Float32Array(8192);
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    const toneFlat = spectralFlatness(tone);

    expect(noiseFlat).toBeGreaterThan(toneFlat);
    expect(toneFlat).toBeLessThan(0.1);
  });
});

describe('statisticalAnomaly', () => {
  it('does not flag white noise', () => {
    const result = statisticalAnomaly(noise(8192, 7));
    expect(result.flagged).toBe(false);
    expect(result.entropy).toBeGreaterThan(6);
  });

  it('flags a sparse, spiky signal (high kurtosis, low entropy)', () => {
    const rng = createRng(8);
    const x = new Float32Array(8192); // mostly zeros
    for (let i = 0; i < x.length; i++) if (rng.next() < 0.01) x[i] = 0.9;
    const result = statisticalAnomaly(x);
    expect(result.flagged).toBe(true);
    expect(result.excessKurtosis).toBeGreaterThan(2);
  });
});

describe('highFrequencyProfile', () => {
  const HI_SR = 44100;

  it('flags a strong high-frequency tone', () => {
    const x = new Float32Array(16384);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 18000 * i) / HI_SR);
    const result = highFrequencyProfile(x, HI_SR);
    expect(result.suspectPeaks).toBeGreaterThan(0);
    expect(result.flagged).toBe(true);
  });

  it('stays quiet on a low-frequency tone', () => {
    const x = new Float32Array(16384);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / HI_SR);
    expect(highFrequencyProfile(x, HI_SR).flagged).toBe(false);
  });
});

describe('analyzeWatermarks', () => {
  it('bundles all heuristics', () => {
    const result = analyzeWatermarks(noise(8192, 4), SAMPLE_RATE);
    expect(result.echo).toHaveProperty('detected');
    expect(result.spectralFlatness).toBeGreaterThan(0);
    expect(result.statistics).toHaveProperty('flagged');
    expect(result.highFrequency).toHaveProperty('flagged');
  });
});
