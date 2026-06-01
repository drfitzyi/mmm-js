import { describe, it, expect } from 'vitest';
import { processWithMode } from './pipeline';
import { encodeWavPcm, decodeWavPcm } from '../audio/pcm';
import { MODES, MODE_ORDER, isModeName } from '../modes';
import { createRng } from '../dsp/prng';
import { concat, wavChunk, wavFile, id3v2, id3v1, mpegFrames } from '../audio/testutil';

function toneWav(length: number, freq: number, sampleRate: number, seed: number): Uint8Array {
  const rng = createRng(seed);
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    x[i] = 0.6 * Math.sin((2 * Math.PI * freq * i) / sampleRate) + 0.05 * rng.nextSigned();
  }
  return encodeWavPcm({ sampleRate, channels: [x] });
}

describe('modes presets', () => {
  it('exposes all modes in order with consistent names', () => {
    expect(MODE_ORDER.map((m) => MODES[m].name)).toEqual(MODE_ORDER);
    expect(isModeName('standard')).toBe(true);
    expect(isModeName('nope')).toBe(false);
  });

  it('only the metadata mode is lossless (null spectral)', () => {
    expect(MODES.metadata.spectral).toBeNull();
    expect(MODES.turbo.spectral).not.toBeNull();
    expect(MODES.paranoid.spectral!.passes).toBeGreaterThanOrEqual(2);
  });
});

describe('processWithMode — metadata mode (lossless)', () => {
  it('strips a WAV LIST chunk losslessly and reports it', async () => {
    const wav = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(200)),
      wavChunk('LIST', new Uint8Array(60))
    );
    const out = await processWithMode(wav, 'metadata');

    expect(out.outputFormat).toBe('wav');
    expect(out.report.lossless).toBe(true);
    expect(out.report.metadata.bytesRemoved).toBe(8 + 60);
    expect(out.report.verification.passed).toBe(true);
    expect(out.report.verification.residualMetadataBytes).toBe(0);
    expect(out.report.verification.audioPreserved).toBe(true);
  });

  it('strips MP3 tags losslessly (no ffmpeg needed)', async () => {
    const file = concat(id3v2(40), mpegFrames(400), id3v1());
    const out = await processWithMode(file, 'metadata');

    expect(out.outputFormat).toBe('mp3');
    expect(out.report.lossless).toBe(true);
    expect(out.report.metadata.bytesRemoved).toBe(50 + 128);
    expect(out.report.verification.passed).toBe(true);
  });
});

describe('processWithMode — spectral mode on WAV', () => {
  it('disrupts the audio, preserves length, leaves no metadata', async () => {
    const sampleRate = 44100;
    const original = toneWav(8192, 440, sampleRate, 11);
    const out = await processWithMode(original, 'standard', { seed: 5 });

    expect(out.outputFormat).toBe('wav');
    expect(out.report.lossless).toBe(false);
    expect(out.report.spectral).toEqual(MODES.standard.spectral);
    expect(out.report.verification.residualMetadataBytes).toBe(0);
    expect(out.report.verification.passed).toBe(true);
    expect(out.report.watermarksBefore.length).toBe(1);

    const before = decodeWavPcm(original).channels[0]!;
    const after = decodeWavPcm(out.bytes).channels[0]!;
    expect(after.length).toBe(before.length);

    let maxDiff = 0;
    for (let i = 1024; i < before.length - 1024; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(after[i]! - before[i]!));
    }
    expect(maxDiff).toBeGreaterThan(1e-3);
  });

  it('paranoid mode applies more change than turbo', async () => {
    const sampleRate = 44100;
    const original = toneWav(8192, 440, sampleRate, 12);
    const base = decodeWavPcm(original).channels[0]!;

    const turbo = decodeWavPcm((await processWithMode(original, 'turbo', { seed: 1 })).bytes)
      .channels[0]!;
    const paranoid = decodeWavPcm((await processWithMode(original, 'paranoid', { seed: 1 })).bytes)
      .channels[0]!;

    const energy = (a: Float32Array): number => {
      let s = 0;
      for (let i = 1024; i < base.length - 1024; i++) {
        const d = a[i]! - base[i]!;
        s += d * d;
      }
      return s;
    };

    expect(energy(paranoid)).toBeGreaterThan(energy(turbo));
  });
});

describe('processWithMode — errors', () => {
  it('throws on unsupported input', async () => {
    await expect(processWithMode(new Uint8Array([1, 2, 3, 4]), 'standard')).rejects.toThrow(
      /Unsupported/
    );
  });
});
