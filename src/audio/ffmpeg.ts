// Browser-only codec bridge built on ffmpeg.wasm.
//
// We use the SINGLE-THREADED core (@ffmpeg/core) on purpose: the multi-threaded
// core needs SharedArrayBuffer, which requires COOP/COEP response headers that
// GitHub Pages cannot set. The ST core is slower but works on a plain static host.
//
// The core (~30 MB wasm) is bundled as a hashed asset and only fetched the first
// time a transcode is requested — keep all imports here behind a dynamic import()
// at the call site so it never enters the initial bundle.
//
// NOTE: this module cannot run under the Node/Vitest test environment; it is
// exercised in the browser. Keep the logic here thin and push testable work into
// the pure DSP/codec modules.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

export type LogHandler = (message: string) => void;
export type ProgressHandler = (ratio: number) => void;

let loading: Promise<FFmpeg> | null = null;

// Listeners are attached to the FFmpeg instance exactly once (at load). They
// forward to the handlers of the in-flight transcode via these refs, so we
// never stack a new listener — and hold a stale closure — per call.
let currentLog: LogHandler | undefined;
let currentProgress: ProgressHandler | undefined;

/** Lazily instantiate and load the ffmpeg.wasm core (memoized). */
async function getFFmpeg(): Promise<FFmpeg> {
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => currentLog?.(message));
      ffmpeg.on('progress', ({ progress }) => currentProgress?.(progress));
      // Convert the bundled asset URLs to blob URLs so the internal worker can
      // import them without cross-origin restrictions.
      await ffmpeg.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      });
      return ffmpeg;
    })();
  }
  return loading;
}

/** True once the core has been requested (so the UI can show a one-time loading hint). */
export function isFFmpegLoading(): boolean {
  return loading !== null;
}

interface TranscodeOptions {
  onLog?: LogHandler;
  onProgress?: ProgressHandler;
}

/**
 * Run a single ffmpeg invocation: write `input` as `inputName`, execute
 * `-i inputName ...args outputName`, and return the bytes of `outputName`.
 */
export async function transcode(
  input: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[],
  options: TranscodeOptions = {}
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();
  currentLog = options.onLog;
  currentProgress = options.onProgress;

  // ffmpeg.writeFile transfers the buffer to its worker, which DETACHES it in
  // the main thread. Hand over a throwaway copy so the caller's bytes (which the
  // UI keeps for repeated strip/clean/analyze actions) stay valid.
  await ffmpeg.writeFile(inputName, input.slice());
  try {
    await ffmpeg.exec(['-i', inputName, ...args, outputName]);
    const data = await ffmpeg.readFile(outputName);
    if (typeof data === 'string') {
      throw new Error('ffmpeg returned text where binary output was expected');
    }
    return data;
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    currentLog = undefined;
    currentProgress = undefined;
  }
}

/** Decode any supported input to 16-bit PCM WAV (consumable by `decodeWavPcm`). */
export function decodeToWav(
  input: Uint8Array,
  inputName: string,
  options?: TranscodeOptions
): Promise<Uint8Array> {
  return transcode(input, inputName, 'decoded.wav', ['-c:a', 'pcm_s16le'], options);
}

/** Encode a WAV file to MP3 via libmp3lame. `quality` is libmp3lame -q:a (0 best … 9). */
export function encodeMp3(
  wav: Uint8Array,
  quality = 2,
  options?: TranscodeOptions
): Promise<Uint8Array> {
  return transcode(
    wav,
    'input.wav',
    'output.mp3',
    ['-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', String(quality)],
    options
  );
}

/**
 * Build an ffmpeg filter that shifts pitch up by `ratio` while preserving tempo:
 * resample faster (raises pitch + tempo), restore the sample rate, then slow the
 * tempo back down. A small shift (a few percent) is enough to move spectral
 * content off the positions acoustic fingerprinters key on.
 */
function pitchFilter(sampleRate: number, ratio: number): string {
  const target = Math.round(sampleRate * ratio);
  const tempo = (1 / ratio).toFixed(6);
  return `asetrate=${target},aresample=${sampleRate},atempo=${tempo}`;
}

/** Pitch-shift a WAV and return a WAV (16-bit PCM). */
export function pitchShiftToWav(
  wav: Uint8Array,
  sampleRate: number,
  ratio: number,
  options?: TranscodeOptions
): Promise<Uint8Array> {
  return transcode(
    wav,
    'pitch-in.wav',
    'pitch-out.wav',
    [
      '-af',
      pitchFilter(sampleRate, ratio),
      '-map_metadata',
      '-1',
      '-flags',
      '+bitexact',
      '-c:a',
      'pcm_s16le',
    ],
    options
  );
}

/** Pitch-shift a WAV and encode the result to MP3. */
export function pitchShiftToMp3(
  wav: Uint8Array,
  sampleRate: number,
  ratio: number,
  quality = 2,
  options?: TranscodeOptions
): Promise<Uint8Array> {
  return transcode(
    wav,
    'pitch-in.wav',
    'pitch-out.mp3',
    [
      '-af',
      pitchFilter(sampleRate, ratio),
      '-map_metadata',
      '-1',
      '-c:a',
      'libmp3lame',
      '-q:a',
      String(quality),
    ],
    options
  );
}
