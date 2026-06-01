// Iterative radix-2 Cooley-Tukey FFT operating in place on separate real and
// imaginary arrays. Lengths must be a power of two.

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * In-place complex FFT. `re`/`im` hold the input on entry and the transform on
 * exit. With `inverse = true` it computes the IFFT (scaled by 1/n).
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length) throw new Error('re/im length mismatch');
  if (n <= 1) return;
  if (!isPowerOfTwo(n)) throw new Error(`FFT length must be a power of two, got ${n}`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const reA = re[a]!;
        const imA = im[a]!;
        const reB = re[b]!;
        const imB = im[b]!;
        const bRe = reB * curRe - imB * curIm;
        const bIm = reB * curIm + imB * curRe;
        re[b] = reA - bRe;
        im[b] = imA - bIm;
        re[a] = reA + bRe;
        im[a] = imA + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/** Magnitude spectrum |X[k]| for k in [0, n). */
export function magnitudes(re: Float64Array, im: Float64Array): Float64Array {
  const out = new Float64Array(re.length);
  for (let i = 0; i < re.length; i++) {
    out[i] = Math.hypot(re[i]!, im[i]!);
  }
  return out;
}
