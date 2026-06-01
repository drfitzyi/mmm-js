// Helpers for building synthetic audio containers in tests.

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0) & 0xff);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Build a RIFF chunk: 4-char id + uint32-LE size + data (+ pad byte if odd). */
export function wavChunk(id: string, data: Uint8Array): Uint8Array {
  const padded = data.length % 2 === 1;
  const out = new Uint8Array(8 + data.length + (padded ? 1 : 0));
  out.set(ascii(id.padEnd(4)), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

/** Wrap chunk bytes in a RIFF/WAVE container with a correct size field. */
export function wavFile(...chunks: Uint8Array[]): Uint8Array {
  const body = concat(...chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(ascii('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(ascii('WAVE'), 8);
  out.set(body, 12);
  return out;
}

/** A minimal ID3v2.3 tag with `contentLength` bytes of (zeroed) payload. */
export function id3v2(contentLength: number): Uint8Array {
  if (contentLength >= 128) throw new Error('test helper only encodes 7-bit sizes');
  const tag = new Uint8Array(10 + contentLength);
  tag.set(ascii('ID3'), 0);
  tag[3] = 3; // version major
  tag[4] = 0; // version minor
  tag[5] = 0; // flags
  // synchsafe size, contentLength < 128 fits in the last byte
  tag[9] = contentLength & 0x7f;
  return tag;
}

/** A 128-byte ID3v1 tag. */
export function id3v1(): Uint8Array {
  const tag = new Uint8Array(128);
  tag.set(ascii('TAG'), 0);
  return tag;
}

/** Fake MPEG audio bytes starting with a valid frame sync. */
export function mpegFrames(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  buf[0] = 0xff;
  buf[1] = 0xfb; // MPEG-1 Layer III, no CRC
  return buf;
}

/** An APEv2 footer (no items, no header flag) describing a `size`-byte tag. */
export function apeFooter(size: number): Uint8Array {
  const buf = new Uint8Array(32);
  buf.set(ascii('APETAGEX'), 0);
  const dv = new DataView(buf.buffer);
  dv.setUint32(8, 2000, true); // version
  dv.setUint32(12, size, true); // tag size incl. footer, excl. header
  dv.setUint32(16, 0, true); // item count
  dv.setUint32(20, 0, true); // flags: no header present
  return buf;
}
