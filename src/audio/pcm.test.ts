import { describe, it, expect } from 'vitest';
import { decodeWavPcm, encodeWavPcm } from './pcm';
import type { PcmAudio } from './pcm';

function tone(length: number, freq: number, sampleRate: number): Float32Array {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) x[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return x;
}

describe('WAV PCM codec', () => {
  it('round-trips stereo audio within 16-bit quantization error', () => {
    const sampleRate = 44100;
    const original: PcmAudio = {
      sampleRate,
      channels: [tone(2000, 440, sampleRate), tone(2000, 660, sampleRate)],
    };

    const decoded = decodeWavPcm(encodeWavPcm(original));

    expect(decoded.sampleRate).toBe(sampleRate);
    expect(decoded.channels.length).toBe(2);
    expect(decoded.channels[0]!.length).toBe(2000);

    for (let ch = 0; ch < 2; ch++) {
      let maxErr = 0;
      for (let i = 0; i < 2000; i++) {
        maxErr = Math.max(maxErr, Math.abs(decoded.channels[ch]![i]! - original.channels[ch]![i]!));
      }
      // One LSB of 16-bit ≈ 1/32768.
      expect(maxErr).toBeLessThan(2 / 32768);
    }
  });

  it('produces a file that the WAV parser accepts', () => {
    const bytes = encodeWavPcm({ sampleRate: 8000, channels: [tone(100, 200, 8000)] });
    // Decoding again should not throw and should preserve the channel count.
    expect(decodeWavPcm(bytes).channels.length).toBe(1);
  });

  it('clamps out-of-range samples instead of wrapping', () => {
    const loud = new Float32Array([2, -2, 0.5]);
    const decoded = decodeWavPcm(encodeWavPcm({ sampleRate: 8000, channels: [loud] }));
    expect(decoded.channels[0]![0]).toBeCloseTo(1, 3);
    expect(decoded.channels[0]![1]).toBeCloseTo(-1, 3);
  });

  it('throws on an unsupported bit depth', () => {
    // Hand-build an 8-bit PCM fmt chunk to confirm the guard fires.
    const bytes = encodeWavPcm({ sampleRate: 8000, channels: [new Float32Array([0])] });
    // Patch bitsPerSample (offset: 12 RIFF + 8 chunk header + 14 within fmt) to 8.
    bytes[12 + 8 + 14] = 8;
    expect(() => decodeWavPcm(bytes)).toThrow(/Unsupported/);
  });
});
