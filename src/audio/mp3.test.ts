import { describe, it, expect } from 'vitest';
import { parseMp3 } from './mp3';
import { metadataByteCount } from './types';
import { concat, id3v2, id3v1, mpegFrames, apeFooter } from './testutil';

describe('parseMp3', () => {
  it('locates a leading ID3v2 tag and the audio region', () => {
    const tag = id3v2(50); // 10 + 50 = 60 bytes
    const audio = mpegFrames(200);
    const parsed = parseMp3(concat(tag, audio));

    expect(parsed.audioOffset).toBe(60);
    expect(parsed.audioLength).toBe(200);
    expect(parsed.firstFrameOffset).toBe(60);
    expect(metadataByteCount(parsed)).toBe(60);
  });

  it('locates a trailing ID3v1 tag', () => {
    const audio = mpegFrames(300);
    const parsed = parseMp3(concat(audio, id3v1()));

    expect(parsed.audioOffset).toBe(0);
    expect(parsed.audioLength).toBe(300);
    const labels = parsed.regions.map((r) => r.label);
    expect(labels).toContain('ID3v1 tag');
    expect(metadataByteCount(parsed)).toBe(128);
  });

  it('handles ID3v2 + audio + APEv2 + ID3v1 together in order', () => {
    const v2 = id3v2(40); // 50 bytes
    const audio = mpegFrames(500);
    const ape = apeFooter(32); // footer-only, 32 bytes
    const v1 = id3v1(); // 128 bytes
    const parsed = parseMp3(concat(v2, audio, ape, v1));

    expect(parsed.regions.map((r) => r.label)).toEqual([
      'ID3v2.3 tag',
      'MPEG audio frames',
      'APEv2 tag',
      'ID3v1 tag',
    ]);
    expect(parsed.audioOffset).toBe(50);
    expect(parsed.audioLength).toBe(500);
    expect(metadataByteCount(parsed)).toBe(50 + 32 + 128);
  });

  it('parses a bare frame stream with no tags', () => {
    const parsed = parseMp3(mpegFrames(128));
    expect(metadataByteCount(parsed)).toBe(0);
    expect(parsed.audioLength).toBe(128);
  });

  it('throws when there is no ID3 tag or frame sync', () => {
    expect(() => parseMp3(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toThrow();
  });
});
