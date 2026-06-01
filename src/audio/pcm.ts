import { parseWav, buildWav } from './wav';

/** Decoded linear PCM audio: one Float32Array of samples in [-1, 1] per channel. */
export interface PcmAudio {
  sampleRate: number;
  /** channels[c][frame] — all channels have the same length. */
  channels: Float32Array[];
}

// WAVE format tags.
const WAVE_PCM = 1;
const WAVE_FLOAT = 3;
const WAVE_EXTENSIBLE = 0xfffe;

/**
 * Decode a WAV file's `data` chunk into per-channel Float32 sample arrays.
 * Supports 16-bit integer PCM and 32-bit IEEE float (the two common cases,
 * including WAVE_FORMAT_EXTENSIBLE wrappers around them).
 *
 * @throws on missing chunks or an unsupported sample format.
 */
export function decodeWavPcm(bytes: Uint8Array): PcmAudio {
  const wav = parseWav(bytes);
  const fmt = wav.chunks.find((c) => c.id === 'fmt ');
  const data = wav.chunks.find((c) => c.id === 'data');
  if (!fmt) throw new Error('WAV is missing a fmt chunk');
  if (!data) throw new Error('WAV is missing a data chunk');

  const fmtView = new DataView(fmt.data.buffer, fmt.data.byteOffset, fmt.data.byteLength);
  let formatTag = fmtView.getUint16(0, true);
  const channelCount = fmtView.getUint16(2, true);
  const sampleRate = fmtView.getUint32(4, true);
  const bitsPerSample = fmtView.getUint16(14, true);

  // WAVE_FORMAT_EXTENSIBLE stores the real tag in the sub-format GUID's first
  // two bytes; we only need to know int-vs-float, which bit depth implies here.
  if (formatTag === WAVE_EXTENSIBLE && fmt.data.length >= 26) {
    formatTag = fmtView.getUint16(24, true);
  }

  if (channelCount < 1) throw new Error('WAV has no channels');

  const isFloat = formatTag === WAVE_FLOAT;
  const isPcm16 = formatTag === WAVE_PCM && bitsPerSample === 16;
  if (!isFloat && !isPcm16) {
    throw new Error(
      `Unsupported WAV sample format (tag ${formatTag}, ${bitsPerSample}-bit); only 16-bit PCM and 32-bit float are supported`
    );
  }

  const bytesPerSample = isFloat ? 4 : 2;
  const frameBytes = bytesPerSample * channelCount;
  const frameCount = Math.floor(data.data.length / frameBytes);
  const view = new DataView(data.data.buffer, data.data.byteOffset, data.data.byteLength);

  const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame++) {
    const base = frame * frameBytes;
    for (let ch = 0; ch < channelCount; ch++) {
      const off = base + ch * bytesPerSample;
      const sample = isFloat ? view.getFloat32(off, true) : view.getInt16(off, true) / 32768;
      channels[ch]![frame] = sample;
    }
  }

  return { sampleRate, channels };
}

/** Encode per-channel Float32 audio into a 16-bit PCM WAV file. */
export function encodeWavPcm(audio: PcmAudio): Uint8Array {
  const { sampleRate, channels } = audio;
  const channelCount = channels.length;
  if (channelCount < 1) throw new Error('Cannot encode audio with no channels');
  const frameCount = channels[0]!.length;
  const bitsPerSample = 16;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  const fmt = new Uint8Array(16);
  const fmtView = new DataView(fmt.buffer);
  fmtView.setUint16(0, WAVE_PCM, true);
  fmtView.setUint16(2, channelCount, true);
  fmtView.setUint32(4, sampleRate, true);
  fmtView.setUint32(8, byteRate, true);
  fmtView.setUint16(12, blockAlign, true);
  fmtView.setUint16(14, bitsPerSample, true);

  const data = new Uint8Array(frameCount * blockAlign);
  const dataView = new DataView(data.buffer);
  for (let frame = 0; frame < frameCount; frame++) {
    for (let ch = 0; ch < channelCount; ch++) {
      const s = clamp(channels[ch]![frame] ?? 0, -1, 1);
      // Symmetric quantization to int16.
      const q = Math.round(s * 32767);
      dataView.setInt16((frame * channelCount + ch) * 2, q, true);
    }
  }

  return buildWav([
    { id: 'fmt ', data: fmt },
    { id: 'data', data },
  ]);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
