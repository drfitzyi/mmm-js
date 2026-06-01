import { ByteReader } from './binary';
import type { AudioFormat } from './types';

/**
 * Detect the audio container from its leading bytes (magic numbers), never the
 * file extension. Returns null for anything we don't handle.
 *
 * - WAV: "RIFF" .... "WAVE"
 * - MP3: an "ID3" tag at the start, or a raw MPEG frame sync (0xFFEx/0xFFFx).
 */
export function detectFormat(bytes: Uint8Array): AudioFormat | null {
  const r = new ByteReader(bytes);

  if (bytes.length >= 12 && r.ascii(0, 4) === 'RIFF' && r.ascii(8, 4) === 'WAVE') {
    return 'wav';
  }

  if (bytes.length >= 3 && r.ascii(0, 3) === 'ID3') {
    return 'mp3';
  }

  // Raw MPEG audio frame: 11 sync bits set (0xFF followed by 0b111xxxxx).
  if (bytes.length >= 2 && r.u8(0) === 0xff && (r.u8(1) & 0xe0) === 0xe0) {
    return 'mp3';
  }

  return null;
}
