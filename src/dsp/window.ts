// Analysis/synthesis windows for STFT processing.

const cache = new Map<number, Float64Array>();

/**
 * Periodic Hann window of length `n` (the DFT-friendly variant: divisor `n`,
 * not `n - 1`). Cached because the same size is reused across every frame.
 */
export function hannWindow(n: number): Float64Array {
  const cached = cache.get(n);
  if (cached) return cached;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  }
  cache.set(n, w);
  return w;
}
