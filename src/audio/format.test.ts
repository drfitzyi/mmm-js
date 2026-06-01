import { describe, it, expect } from 'vitest';
import { detectFormat } from './format';
import { wavFile, wavChunk, id3v2, mpegFrames } from './testutil';

describe('detectFormat', () => {
  it('detects WAV from RIFF/WAVE magic', () => {
    const wav = wavFile(wavChunk('fmt ', new Uint8Array(16)));
    expect(detectFormat(wav)).toBe('wav');
  });

  it('detects MP3 from a leading ID3 tag', () => {
    expect(detectFormat(id3v2(20))).toBe('mp3');
  });

  it('detects MP3 from a raw frame sync', () => {
    expect(detectFormat(mpegFrames(64))).toBe('mp3');
  });

  it('returns null for unknown data', () => {
    expect(detectFormat(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it('returns null for too-short input', () => {
    expect(detectFormat(new Uint8Array([0xff]))).toBeNull();
  });
});
