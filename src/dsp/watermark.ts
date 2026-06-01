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

export interface StatisticalAnomaly {
  /** Excess kurtosis of the samples (0 ≈ Gaussian). */
  excessKurtosis: number;
  /** Shannon entropy of the amplitude histogram, in bits (0..8 for 256 bins). */
  entropy: number;
  /** Flagged when entropy is low or kurtosis is far from normal. */
  flagged: boolean;
}

export interface HighFrequencyProfile {
  /** Fraction of spectral energy above 15 kHz. */
  energyRatioAbove15k: number;
  /** Number of bins in 15–22 kHz exceeding mean + 3σ (possible spread-spectrum marks). */
  suspectPeaks: number;
  flagged: boolean;
}

export interface WatermarkAnalysis {
  echo: EchoFinding;
  /**
   * Spectral flatness in [0, 1]: ratio of geometric to arithmetic mean of the
   * power spectrum. Near 0 = tonal/musical; near 1 = noise-like. Spread-spectrum
   * watermarks raise the noise floor and push this up — a heuristic flag, not proof.
   */
  spectralFlatness: number;
  statistics: StatisticalAnomaly;
  highFrequency: HighFrequencyProfile;
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

/**
 * Statistical anomaly check: excess kurtosis and amplitude-histogram entropy.
 * Machine/watermarked signals can show low entropy or non-Gaussian kurtosis.
 * Thresholds mirror upstream mmm (entropy < 6 bits, |excess kurtosis| > 2).
 */
export function statisticalAnomaly(
  samples: Float32Array,
  options: WatermarkOptions = {}
): StatisticalAnomaly {
  const maxSamples = options.maxSamples ?? DEFAULTS.maxSamples;
  const n = Math.min(samples.length, maxSamples);
  if (n < 16) return { excessKurtosis: 0, entropy: 0, flagged: false };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i]!;
  mean /= n;

  let m2 = 0;
  let m4 = 0;
  const bins = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean;
    m2 += d * d;
    m4 += d * d * d * d;
    // Histogram over [-1, 1] clamped into 256 buckets.
    const idx = Math.min(255, Math.max(0, Math.floor((samples[i]! + 1) * 128)));
    bins[idx]!++;
  }
  m2 /= n;
  m4 /= n;
  const excessKurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  let entropy = 0;
  for (const count of bins) {
    if (count === 0) continue;
    const p = count / n;
    entropy -= p * Math.log2(p);
  }

  return {
    excessKurtosis,
    entropy,
    flagged: entropy < 6 || Math.abs(excessKurtosis) > 2,
  };
}

/** High-frequency (>15 kHz) energy/peak profile — a spread-spectrum heuristic. */
export function highFrequencyProfile(
  samples: Float32Array,
  sampleRate: number,
  options: WatermarkOptions = {}
): HighFrequencyProfile {
  const maxSamples = options.maxSamples ?? DEFAULTS.maxSamples;
  const n = Math.min(samples.length, maxSamples);
  const empty: HighFrequencyProfile = { energyRatioAbove15k: 0, suspectPeaks: 0, flagged: false };
  if (n < 64 || sampleRate <= 30000) return empty;

  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = samples[i]!;
  fft(re, im, false);

  const half = size >> 1;
  const binHz = sampleRate / size;
  let totalEnergy = 0;
  let hfEnergy = 0;
  const hfMags: number[] = [];
  for (let k = 1; k < half; k++) {
    const mag = Math.hypot(re[k]!, im[k]!);
    const power = mag * mag;
    totalEnergy += power;
    const hz = k * binHz;
    if (hz > 15000) hfEnergy += power;
    if (hz >= 15000 && hz <= 22000) hfMags.push(mag);
  }

  let suspectPeaks = 0;
  if (hfMags.length > 1) {
    const mean = hfMags.reduce((s, m) => s + m, 0) / hfMags.length;
    const variance = hfMags.reduce((s, m) => s + (m - mean) * (m - mean), 0) / hfMags.length;
    const threshold = mean + 3 * Math.sqrt(variance);
    for (const m of hfMags) if (m > threshold) suspectPeaks++;
  }

  const energyRatioAbove15k = totalEnergy > 0 ? hfEnergy / totalEnergy : 0;
  return {
    energyRatioAbove15k,
    suspectPeaks,
    flagged: suspectPeaks > 0 && energyRatioAbove15k > 1e-4,
  };
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
    statistics: statisticalAnomaly(samples, options),
    highFrequency: highFrequencyProfile(samples, sampleRate, options),
  };
}
