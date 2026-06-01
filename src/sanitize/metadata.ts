import {
  detectFormat,
  parseWav,
  parseMp3,
  buildWav,
  chunkKind,
  parseAudio,
  metadataByteCount,
} from '../audio';
import type { AudioFormat, Region } from '../audio';

export interface StripResult {
  format: AudioFormat;
  /** The metadata-free output file. */
  bytes: Uint8Array;
  /** Size of the original input, in bytes. */
  originalSize: number;
  /** Bytes removed (originalSize - bytes.length). */
  bytesRemoved: number;
  /** The metadata regions that were dropped. */
  removed: Region[];
}

/**
 * Remove all strippable metadata from an MP3 or WAV file, returning a new
 * byte array. The audio payload is preserved bit-for-bit; only tags / ancillary
 * chunks are dropped.
 *
 * @throws if the format is unsupported or — as a safety net — if the output
 *   still contains metadata after stripping.
 */
export function stripMetadata(bytes: Uint8Array): StripResult {
  const format = detectFormat(bytes);
  let result: { bytes: Uint8Array; removed: Region[] };

  switch (format) {
    case 'wav':
      result = stripWav(bytes);
      break;
    case 'mp3':
      result = stripMp3(bytes);
      break;
    default:
      throw new Error('Unsupported file: expected an MP3 or WAV');
  }

  // Safety net: the output must contain no residual metadata.
  const residual = metadataByteCount(parseAudio(result.bytes));
  if (residual > 0) {
    throw new Error(`Sanitize failed: ${residual} bytes of metadata remain in the output`);
  }

  return {
    format,
    bytes: result.bytes,
    originalSize: bytes.length,
    bytesRemoved: bytes.length - result.bytes.length,
    removed: result.removed,
  };
}

function stripWav(bytes: Uint8Array): { bytes: Uint8Array; removed: Region[] } {
  const wav = parseWav(bytes);
  const kept = wav.chunks.filter((c) => chunkKind(c.id) !== 'metadata');
  const removed = wav.regions.filter((r) => r.kind === 'metadata');
  return {
    bytes: buildWav(kept.map((c) => ({ id: c.id, data: c.data }))),
    removed,
  };
}

function stripMp3(bytes: Uint8Array): { bytes: Uint8Array; removed: Region[] } {
  const mp3 = parseMp3(bytes);
  const removed = mp3.regions.filter((r) => r.kind === 'metadata');
  // Copy the audio span into a standalone buffer so the result owns its bytes.
  const audio = bytes.slice(mp3.audioOffset, mp3.audioOffset + mp3.audioLength);
  return { bytes: audio, removed };
}
