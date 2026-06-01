import { detectFormat } from './format';
import { parseWav } from './wav';
import { parseMp3 } from './mp3';
import type { AudioInfo } from './types';

export { detectFormat } from './format';
export { parseWav, buildWav } from './wav';
export type { WavFile, WavChunk } from './wav';
export { parseMp3 } from './mp3';
export type { Mp3File } from './mp3';
export { metadataByteCount } from './types';
export type { AudioFormat, AudioInfo, Region, RegionKind } from './types';

/**
 * Detect the format from the bytes and parse the container structure.
 * @throws if the format is unsupported or the container is malformed.
 */
export function parseAudio(bytes: Uint8Array): AudioInfo {
  const format = detectFormat(bytes);
  switch (format) {
    case 'wav':
      return parseWav(bytes);
    case 'mp3':
      return parseMp3(bytes);
    default:
      throw new Error('Unsupported file: expected an MP3 or WAV');
  }
}
