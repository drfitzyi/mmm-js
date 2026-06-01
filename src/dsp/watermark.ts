import { fft } from './fft';

export interface EchoFinding {
  /** Whether a likely echo/reverb watermark was detected. */
  detected: boolean;
  /** Estimated echo delay in samples (peak quefrency). */
  lagSamples: number;
  /** Estimated echo delay in milliseconds. */
  lagMs: number;
  /** Peak-to-mean ratio of the cepstrum in the search band (higher = stronger). */
  strength: number;
}

export interface WatermarkAnalysis {
  echo: EchoFinding;
  /**
   * Spectral flatness in [0, 1]: ratio of geometric to arithmetic mean of the
   * power spectrum. Near 0 = tonal/musical; near 1 = noise-like. Spread-spectrum
   * watermarks raise the noise floor and push this up — a heuristic flag, not proof.
   */
  spectralFlatness: number;
}

export interface WatermarkOptions {
  /** Cap on samples analysed (keeps the FFT bounded for long files). */
  maxSamples?: number;
  /** Peak-to-mean cepstrum ratio above which an echo is flagged. */
  echoThreshold?: number;
}

const DEFAULTS = { maxSamples: 1 << 15, echoThreshold: 6 } as const;

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Detect an echo/reverb watermark via the real cepstrum. An echo
 * x[n] + a·x[n-d] adds a multiplicative comb to the spectrum, which appears as
 * a peak at quefrency d in the cepstrum — robust against the signal's own
 * pitch periodicity in a way raw autocorrelation is not.
 */
export function detectEcho(
  samples: Float32Array,
  sampleRate: number,
  options: WatermarkOptions = {}
): EchoFinding {
  const maxSamples = options.maxSamples ?? DEFAULTS.maxSamples;
  const threshold = options.echoThreshold ?? DEFAULTS.echoThreshold;
  const n = Math.min(samples.length, maxSamples);
  const empty: EchoFinding = { detected: false, lagSamples: 0, lagMs: 0, strength: 0 };
  if (n < 64) return empty;

  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = samples[i]!;

  fft(re, im, false);
  for (let k = 0; k < size; k++) {
    re[k] = Math.log(Math.hypot(re[k]!, im[k]!) + 1e-9);
    im[k] = 0;
  }
  fft(re, im, true); // re now holds the real cepstrum

  const minLag = Math.max(8, Math.floor(0.002 * sampleRate)); // ignore very short quefrencies
  const maxLag = Math.min(size >> 1, Math.floor(0.5 * sampleRate)); // up to 500 ms
  if (maxLag <= minLag) return empty;

  let peakLag = minLag;
  let peakVal = 0;
  let sumAbs = 0;
  for (let q = minLag; q <= maxLag; q++) {
    const v = Math.abs(re[q]!);
    sumAbs += v;
    if (v > peakVal) {
      peakVal = v;
      peakLag = q;
    }
  }
  const meanAbs = sumAbs / (maxLag - minLag + 1);
  const strength = peakVal / (meanAbs + 1e-12);

  return {
    detected: strength > threshold,
    lagSamples: peakLag,
    lagMs: (peakLag / sampleRate) * 1000,
    strength,
  };
}

/** Spectral flatness of the first analysis window. */
export function spectralFlatness(samples: Float32Array, options: WatermarkOptions = {}): number {
  const maxSamples = options.maxSamples ?? DEFAULTS.maxSamples;
  const n = Math.min(samples.length, maxSamples);
  if (n < 8) return 0;

  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = samples[i]!;
  fft(re, im, false);

  const half = size >> 1;
  let logSum = 0;
  let linSum = 0;
  for (let k = 1; k < half; k++) {
    const power = re[k]! * re[k]! + im[k]! * im[k]! + 1e-12;
    logSum += Math.log(power);
    linSum += power;
  }
  const count = half - 1;
  const geoMean = Math.exp(logSum / count);
  const arithMean = linSum / count;
  return geoMean / arithMean;
}

/** Run all watermark heuristics over a single channel. */
export function analyzeWatermarks(
  samples: Float32Array,
  sampleRate: number,
  options: WatermarkOptions = {}
): WatermarkAnalysis {
  return {
    echo: detectEcho(samples, sampleRate, options),
    spectralFlatness: spectralFlatness(samples, options),
  };
}
