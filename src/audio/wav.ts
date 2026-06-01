import { ByteReader, writeAscii } from './binary';
import type { AudioInfo, Region, RegionKind } from './types';

/** A single RIFF chunk located within a WAV file. */
export interface WavChunk {
  /** 4-character chunk id, e.g. "fmt ", "data", "LIST". Trailing spaces preserved. */
  id: string;
  /** Offset of the chunk's data (after the 8-byte id+size header). */
  dataOffset: number;
  /** A view onto the chunk's data bytes (not copied). */
  data: Uint8Array;
}

export interface WavFile extends AudioInfo {
  format: 'wav';
  chunks: WavChunk[];
}

// Chunks that carry the actual audio/structure and must be preserved.
const ESSENTIAL_CHUNKS = new Set(['fmt ', 'data', 'fact']);

/** Classify a RIFF chunk: `data` is audio, fmt/fact are structural, the rest is strippable metadata. */
export function chunkKind(id: string): RegionKind {
  if (id === 'data') return 'audio';
  if (ESSENTIAL_CHUNKS.has(id)) return 'header';
  return 'metadata';
}

/**
 * Parse a WAV/RIFF file into its chunks. Tolerant of a truncated final chunk
 * (clamps the declared size to what's actually present) so partial files still
 * yield a usable structure.
 *
 * @throws if the file is not a RIFF/WAVE container.
 */
export function parseWav(bytes: Uint8Array): WavFile {
  const r = new ByteReader(bytes);
  if (bytes.length < 12 || r.ascii(0, 4) !== 'RIFF' || r.ascii(8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  const regions: Region[] = [{ kind: 'header', label: 'RIFF/WAVE header', offset: 0, length: 12 }];
  const chunks: WavChunk[] = [];

  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = r.ascii(pos, 4);
    const declaredSize = r.u32le(pos + 4);
    const dataOffset = pos + 8;
    const available = bytes.length - dataOffset;
    const dataSize = Math.min(declaredSize, available);
    // RIFF chunks are word-aligned: an odd size is followed by a pad byte,
    // but only if that pad byte actually exists in the file.
    const padByte = declaredSize % 2 === 1 && dataOffset + declaredSize < bytes.length ? 1 : 0;

    chunks.push({
      id,
      dataOffset,
      data: bytes.subarray(dataOffset, dataOffset + dataSize),
    });
    regions.push({
      kind: chunkKind(id),
      label: `${id.trim() || '(blank)'} chunk`,
      offset: pos,
      length: 8 + dataSize + padByte,
    });

    pos = dataOffset + dataSize + padByte;
    // Stop if the declared size pointed past EOF (truncated file).
    if (dataSize < declaredSize) break;
  }

  return { format: 'wav', byteLength: bytes.length, regions, chunks };
}

/**
 * Build a valid WAV file from an ordered list of chunks, recomputing the RIFF
 * size field and re-inserting pad bytes for odd-length chunks. This is the
 * writer Phase 2 uses to emit a metadata-stripped file.
 */
export function buildWav(chunks: Array<{ id: string; data: Uint8Array }>): Uint8Array {
  let bodySize = 4; // "WAVE"
  for (const c of chunks) {
    bodySize += 8 + c.data.length + (c.data.length % 2);
  }

  const out = new Uint8Array(8 + bodySize);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'RIFF');
  view.setUint32(4, bodySize, true);
  writeAscii(out, 8, 'WAVE');

  let pos = 12;
  for (const c of chunks) {
    writeAscii(out, pos, c.id.padEnd(4).slice(0, 4));
    view.setUint32(pos + 4, c.data.length, true);
    out.set(c.data, pos + 8);
    pos += 8 + c.data.length;
    if (c.data.length % 2 === 1) {
      out[pos] = 0;
      pos += 1;
    }
  }

  return out;
}
