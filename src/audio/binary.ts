// Low-level helpers for reading/writing binary audio containers.
// All reads go through DataView so out-of-bounds access throws RangeError
// (callers must length-check first) and indexed-access typing stays sound.

export class ByteReader {
  private readonly view: DataView;

  constructor(public readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  u8(offset: number): number {
    return this.view.getUint8(offset);
  }

  u32le(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  u32be(offset: number): number {
    return this.view.getUint32(offset, false);
  }

  /** Read `length` bytes as a Latin-1/ASCII string (used for FourCC and tag markers). */
  ascii(offset: number, length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += String.fromCharCode(this.view.getUint8(offset + i));
    }
    return out;
  }
}

/** Write an ASCII string into `target` at `offset` (low byte only). */
export function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i) & 0xff;
  }
}

/**
 * Decode a 28-bit ID3v2 "synchsafe" integer packed into a 32-bit big-endian word.
 * Each byte uses only its low 7 bits, so the four bytes encode 0..(2^28 - 1).
 */
export function decodeSynchsafe(word: number): number {
  return (
    (word & 0x7f) | ((word & 0x7f00) >> 1) | ((word & 0x7f0000) >> 2) | ((word & 0x7f000000) >> 3)
  );
}
