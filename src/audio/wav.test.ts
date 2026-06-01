import { describe, it, expect } from 'vitest';
import { parseWav, buildWav } from './wav';
import { metadataByteCount } from './types';
import { wavFile, wavChunk, concat } from './testutil';

describe('parseWav', () => {
  it('parses fmt/data/LIST chunks and classifies them', () => {
    const fmt = wavChunk('fmt ', new Uint8Array(16));
    const data = wavChunk('data', new Uint8Array(100));
    const list = wavChunk('LIST', concat(new Uint8Array([...'INFO'].map((c) => c.charCodeAt(0)))));
    const file = wavFile(fmt, data, list);

    const parsed = parseWav(file);

    expect(parsed.format).toBe('wav');
    expect(parsed.chunks.map((c) => c.id)).toEqual(['fmt ', 'data', 'LIST']);

    const kinds = Object.fromEntries(parsed.regions.map((r) => [r.label, r.kind]));
    expect(kinds['RIFF/WAVE header']).toBe('header');
    expect(kinds['fmt chunk']).toBe('header');
    expect(kinds['data chunk']).toBe('audio');
    expect(kinds['LIST chunk']).toBe('metadata');
  });

  it('counts only the LIST chunk as metadata', () => {
    const file = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(100)),
      wavChunk('LIST', new Uint8Array(40))
    );
    // 8-byte chunk header + 40 bytes of data
    expect(metadataByteCount(parseWav(file))).toBe(48);
  });

  it('handles odd-length chunks with a pad byte', () => {
    const file = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(5)) // odd → padded to 6
    );
    const parsed = parseWav(file);
    const dataChunk = parsed.chunks.find((c) => c.id === 'data');
    expect(dataChunk?.data.length).toBe(5);
    // Parsing should consume the whole file including the pad byte.
    expect(parsed.regions.at(-1)?.length).toBe(8 + 5 + 1);
  });

  it('throws on non-RIFF input', () => {
    expect(() => parseWav(new Uint8Array(20))).toThrow(/RIFF/);
  });
});

describe('buildWav', () => {
  it('round-trips a parsed file byte-for-byte', () => {
    const file = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(64))
    );
    const parsed = parseWav(file);
    const rebuilt = buildWav(parsed.chunks.map((c) => ({ id: c.id, data: c.data })));
    expect(rebuilt).toEqual(file);
  });

  it('recomputes the RIFF size when a chunk is dropped', () => {
    const file = wavFile(
      wavChunk('fmt ', new Uint8Array(16)),
      wavChunk('data', new Uint8Array(64)),
      wavChunk('LIST', new Uint8Array(40))
    );
    const parsed = parseWav(file);
    const kept = parsed.chunks
      .filter((c) => c.id !== 'LIST')
      .map((c) => ({ id: c.id, data: c.data }));

    const stripped = buildWav(kept);
    const reparsed = parseWav(stripped);

    expect(reparsed.chunks.map((c) => c.id)).toEqual(['fmt ', 'data']);
    expect(metadataByteCount(reparsed)).toBe(0);
    // RIFF body size = 4 ("WAVE") + (8+16) + (8+64)
    expect(new DataView(stripped.buffer).getUint32(4, true)).toBe(4 + 24 + 72);
  });
});
