import { describe, it, expect } from 'vitest';
import { processWithMode } from './pipeline';
import type { Codec } from './pipeline';
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

// Stub codec: pitch/encode are identity passthroughs so the orchestration and
// report can be tested without ffmpeg. (Real pitch shifting is browser-only.)
const passthroughCodec: Codec = {
  decodeToWav: async (input) => input,
  encodeMp3: async (wav) => wav,
  pitchToWav: async (wav) => wav,
  pitchToMp3: async (wav) => wav,
};

describe('modes presets', () => {
  it('exposes all modes in order with consistent names', () => {
    expect(MODE_ORDER.map((m) => MODES[m].name)).toEqual(MODE_ORDER);
    expect(isModeName('standard')).toBe(true);
    expect(isModeName('nope')).toBe(false);
  });

  it('only the metadata mode is lossless (no pitch, no spectral)', () => {
    expect(MODES.metadata.pitchPercent).toBe(0);
    expect(MODES.metadata.spectral).toBeNull();
    expect(MODES.turbo.pitchPercent).toBeGreaterThan(0);
    expect(MODES.standard.pitchPercent).toBeGreaterThan(0);
    expect(MODES.paranoid.pitchPercent).toBeGreaterThan(MODES.standard.pitchPercent);
    expect(MODES.paranoid.spectral).not.toBeNull();
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
    expect(out.report.pitchPercent).toBe(0);
    expect(out.report.metadata.bytesRemoved).toBe(8 + 60);
    expect(out.report.verification.passed).toBe(true);
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

describe('processWithMode — lossy modes (pitch / spectral)', () => {
  it('standard records the pitch shift and produces a clean, valid output', async () => {
    const wav = toneWav(8192, 440, 44100, 11);
    const out = await processWithMode(wav, 'standard', {}, undefined, passthroughCodec);

    expect(out.report.lossless).toBe(false);
    expect(out.report.pitchPercent).toBe(MODES.standard.pitchPercent);
    expect(out.report.spectral).toBeNull();
    expect(out.report.watermarksBefore.length).toBe(1);
    expect(out.report.verification.residualMetadataBytes).toBe(0);
    expect(out.report.verification.passed).toBe(true);
    // Output is still a decodable WAV.
    expect(decodeWavPcm(out.bytes).channels[0]!.length).toBe(8192);
  });

  it('paranoid applies spectral perturbation that changes the audio', async () => {
    const original = toneWav(8192, 440, 44100, 12);
    const base = decodeWavPcm(original).channels[0]!;

    const out = await processWithMode(
      original,
      'paranoid',
      { seed: 1 },
      undefined,
      passthroughCodec
    );
    const after = decodeWavPcm(out.bytes).channels[0]!;

    expect(out.report.pitchPercent).toBe(MODES.paranoid.pitchPercent);
    expect(out.report.spectral).toEqual(MODES.paranoid.spectral);
    expect(after.length).toBe(base.length);

    let maxDiff = 0;
    for (let i = 1024; i < base.length - 1024; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(after[i]! - base[i]!));
    }
    expect(maxDiff).toBeGreaterThan(1e-3);
  });

  it('turbo (pitch only) leaves the audio unchanged under an identity codec', async () => {
    const original = toneWav(4096, 440, 44100, 13);
    const out = await processWithMode(original, 'turbo', {}, undefined, passthroughCodec);
    // No spectral perturbation, identity pitch → same samples back.
    expect(decodeWavPcm(out.bytes).channels[0]).toEqual(decodeWavPcm(original).channels[0]);
    expect(out.report.pitchPercent).toBe(MODES.turbo.pitchPercent);
  });
});

describe('processWithMode — errors', () => {
  it('throws on unsupported input', async () => {
    await expect(processWithMode(new Uint8Array([1, 2, 3, 4]), 'standard')).rejects.toThrow(
      /Unsupported/
    );
  });
});
