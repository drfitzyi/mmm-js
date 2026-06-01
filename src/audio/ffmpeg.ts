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

let loading: Promise<FFmpeg> | null = null;

/** Lazily instantiate and load the ffmpeg.wasm core (memoized). */
async function getFFmpeg(onLog?: LogHandler): Promise<FFmpeg> {
  if (!loading) {
    loading = (async () => {
      const ffmpeg = new FFmpeg();
      if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
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
  onProgress?: (ratio: number) => void;
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
  const ffmpeg = await getFFmpeg(options.onLog);
  const progress = options.onProgress;
  if (progress) ffmpeg.on('progress', ({ progress: ratio }) => progress(ratio));

  await ffmpeg.writeFile(inputName, input);
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
    ['-c:a', 'libmp3lame', '-q:a', String(quality)],
    options
  );
}
