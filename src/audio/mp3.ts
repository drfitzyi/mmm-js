import { ByteReader, decodeSynchsafe } from './binary';
import type { AudioInfo, Region } from './types';

export interface Mp3File extends AudioInfo {
  format: 'mp3';
  /** Offset where audio (MPEG frames) begins, after any leading ID3v2 tag. */
  audioOffset: number;
  /** Length of the audio payload between leading and trailing tags. */
  audioLength: number;
  /** Offset of the first detected MPEG frame sync within the audio region, or -1. */
  firstFrameOffset: number;
}

const ID3V2_HEADER = 10;
const ID3V1_SIZE = 128;
const APE_FOOTER = 32;

function findFrameSync(r: ByteReader, from: number, to: number): number {
  for (let i = from; i + 1 < to; i++) {
    if (r.u8(i) === 0xff && (r.u8(i + 1) & 0xe0) === 0xe0) return i;
  }
  return -1;
}

/**
 * Locate the tag and audio regions of an MP3. This does NOT decode or fully
 * parse every MPEG frame — for metadata stripping we only need the boundaries
 * between strippable tags and the audio payload:
 *
 *   [ID3v2?]  [audio frames]  [APEv2?]  [ID3v1?]
 *
 * @throws if the bytes look like neither an ID3 tag nor an MPEG frame.
 */
export function parseMp3(bytes: Uint8Array): Mp3File {
  const r = new ByteReader(bytes);
  const leading: Region[] = [];
  const trailing: Region[] = [];

  let start = 0;
  let end = bytes.length;

  // Leading ID3v2 tag.
  if (bytes.length >= ID3V2_HEADER && r.ascii(0, 3) === 'ID3') {
    const major = r.u8(3);
    const flags = r.u8(5);
    const size = decodeSynchsafe(r.u32be(6));
    const hasFooter = (flags & 0x10) !== 0;
    const total = Math.min(ID3V2_HEADER + size + (hasFooter ? ID3V2_HEADER : 0), bytes.length);
    leading.push({ kind: 'metadata', label: `ID3v2.${major} tag`, offset: 0, length: total });
    start = total;
  } else if (!(bytes.length >= 2 && r.u8(0) === 0xff && (r.u8(1) & 0xe0) === 0xe0)) {
    throw new Error('Not an MP3 (no ID3 tag or MPEG frame sync at start)');
  }

  // Trailing ID3v1 tag (always the final 128 bytes when present).
  if (end - start >= ID3V1_SIZE && r.ascii(end - ID3V1_SIZE, 3) === 'TAG') {
    end -= ID3V1_SIZE;
    trailing.unshift({ kind: 'metadata', label: 'ID3v1 tag', offset: end, length: ID3V1_SIZE });
  }

  // Trailing APEv2 tag (its footer sits just before any ID3v1 tag).
  if (end - start >= APE_FOOTER && r.ascii(end - APE_FOOTER, 8) === 'APETAGEX') {
    const tagSize = r.u32le(end - APE_FOOTER + 12); // size incl. footer, excl. header
    const apeFlags = r.u32le(end - APE_FOOTER + 20);
    const hasHeader = (apeFlags & 0x80000000) !== 0;
    const total = tagSize + (hasHeader ? APE_FOOTER : 0);
    const apeOffset = Math.max(start, end - total);
    trailing.unshift({
      kind: 'metadata',
      label: 'APEv2 tag',
      offset: apeOffset,
      length: end - apeOffset,
    });
    end = apeOffset;
  }

  const regions: Region[] = [...leading];
  const audioLength = Math.max(0, end - start);
  if (audioLength > 0) {
    regions.push({ kind: 'audio', label: 'MPEG audio frames', offset: start, length: audioLength });
  }
  regions.push(...trailing);

  return {
    format: 'mp3',
    byteLength: bytes.length,
    regions,
    audioOffset: start,
    audioLength,
    firstFrameOffset: findFrameSync(r, start, end),
  };
}
