// Shared types for the audio I/O layer.

export type AudioFormat = 'wav' | 'mp3';

/**
 * How a byte region should be treated when sanitizing.
 * - `header`: structural bytes required to keep the file valid (e.g. RIFF/WAVE header, fmt chunk).
 * - `audio`: the actual sample payload.
 * - `metadata`: tags / ancillary data that can be stripped (ID3, RIFF INFO, APE, …).
 */
export type RegionKind = 'header' | 'audio' | 'metadata';

/** A contiguous span of the source file. Regions tile the file in order with no gaps. */
export interface Region {
  kind: RegionKind;
  /** Human-readable label, e.g. "ID3v2.3 tag" or "data chunk". */
  label: string;
  /** Byte offset from the start of the file. */
  offset: number;
  /** Length in bytes. */
  length: number;
}

/** Result of parsing a file's container structure (format-agnostic view). */
export interface AudioInfo {
  format: AudioFormat;
  byteLength: number;
  regions: Region[];
}

/** Total bytes across all regions classified as strippable metadata. */
export function metadataByteCount(info: AudioInfo): number {
  return info.regions.filter((r) => r.kind === 'metadata').reduce((sum, r) => sum + r.length, 0);
}
