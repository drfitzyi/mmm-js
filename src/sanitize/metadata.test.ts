import { describe, it, expect } from 'vitest';
import { stripMetadata } from './metadata';
import { parseAudio, parseWav, metadataByteCount } from '../audio';
import { concat, wavFile, wavChunk, id3v2, id3v1, mpegFrames, apeFooter } from '../audio/testutil';

describe('stripMetadata — WAV', () => {
  it('removes a LIST chunk and keeps fmt/data intact', () => {
    const fmt = new Uint8Array(16).fill(7);
    const data = new Uint8Array(100).fill(42);
    const file = wavFile(
      wavChunk('fmt ', fmt),
      wavChunk('data', data),
      wavChunk('LIST', new Uint8Array(40))
    );

    const result = stripMetadata(file);

    expect(result.format).toBe('wav');
    expect(result.bytesRemoved).toBe(8 + 40); // LIST header + data
    const reparsed = parseWav(result.bytes);
    expect(reparsed.chunks.map((c) => c.id)).toEqual(['fmt ', 'data']);
    expect(metadataByteCount(reparsed)).toBe(0);
    // Audio payload preserved bit-for-bit.
    expect(reparsed.chunks.find((c) => c.id === 'data')?.data).toEqual(data);
  });

  it('is idempotent on an already-clean WAV', () => {
    const file = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(64))
    );
    const result = stripMetadata(file);
    expect(result.bytesRemoved).toBe(0);
    expect(result.bytes).toEqual(file);
  });
});

describe('stripMetadata — MP3', () => {
  it('drops ID3v2/APE/ID3v1 leaving only the audio frames', () => {
    const audio = mpegFrames(500);
    const file = concat(id3v2(40), audio, apeFooter(32), id3v1());

    const result = stripMetadata(file);

    expect(result.format).toBe('mp3');
    expect(result.bytes).toEqual(audio);
    expect(result.bytesRemoved).toBe(50 + 32 + 128);
    expect(metadataByteCount(parseAudio(result.bytes))).toBe(0);
    expect(result.removed.map((r) => r.label)).toEqual(['ID3v2.3 tag', 'APEv2 tag', 'ID3v1 tag']);
  });

  it('is idempotent on a tagless MP3', () => {
    const audio = mpegFrames(256);
    const result = stripMetadata(audio);
    expect(result.bytesRemoved).toBe(0);
    expect(result.bytes).toEqual(audio);
  });
});

describe('stripMetadata — errors', () => {
  it('throws on unsupported input', () => {
    expect(() => stripMetadata(new Uint8Array([1, 2, 3, 4]))).toThrow(/Unsupported/);
  });
});
