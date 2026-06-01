import { describe, it, expect } from 'vitest';
import { cleanWavSpectra, analyzeWavWatermarks } from './spectral';
import { encodeWavPcm, decodeWavPcm } from '../audio/pcm';
import { createRng } from '../dsp/prng';

function tone(length: number, freq: number, sampleRate: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    x[i] = 0.6 * Math.sin((2 * Math.PI * freq * i) / sampleRate) + 0.05 * rng.nextSigned();
  }
  return x;
}

describe('cleanWavSpectra', () => {
  it('preserves channel count, sample rate, and length', () => {
    const sampleRate = 44100;
    const wav = encodeWavPcm({
      sampleRate,
      channels: [tone(8192, 440, sampleRate, 1), tone(8192, 550, sampleRate, 2)],
    });

    const cleaned = decodeWavPcm(cleanWavSpectra(wav, { fftSize: 1024, intensity: 0.3 }));

    expect(cleaned.sampleRate).toBe(sampleRate);
    expect(cleaned.channels.length).toBe(2);
    expect(cleaned.channels[0]!.length).toBe(8192);
  });

  it('actually modifies the audio', () => {
    const sampleRate = 44100;
    const original = tone(8192, 440, sampleRate, 3);
    const wav = encodeWavPcm({ sampleRate, channels: [original] });

    const cleaned = decodeWavPcm(cleanWavSpectra(wav, { fftSize: 1024, intensity: 0.5 }));

    let maxDiff = 0;
    for (let i = 1024; i < original.length - 1024; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(cleaned.channels[0]![i]! - original[i]!));
    }
    expect(maxDiff).toBeGreaterThan(1e-3);
  });

  it('jitters stereo channels differently', () => {
    const sampleRate = 44100;
    const mono = tone(8192, 440, sampleRate, 4);
    const wav = encodeWavPcm({ sampleRate, channels: [mono, mono.slice()] });

    const cleaned = decodeWavPcm(cleanWavSpectra(wav, { fftSize: 1024, intensity: 0.5 }));

    let identical = true;
    for (let i = 0; i < mono.length; i++) {
      if (cleaned.channels[0]![i] !== cleaned.channels[1]![i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });
});

describe('analyzeWavWatermarks', () => {
  it('returns one analysis per channel', () => {
    const sampleRate = 44100;
    const wav = encodeWavPcm({
      sampleRate,
      channels: [tone(8192, 440, sampleRate, 5), tone(8192, 550, sampleRate, 6)],
    });
    const analyses = analyzeWavWatermarks(wav);
    expect(analyses.length).toBe(2);
    expect(analyses[0]).toHaveProperty('echo');
    expect(analyses[0]).toHaveProperty('spectralFlatness');
  });
});
