# mmm-js

A browser-based JavaScript port of [geeknik/mmm](https://github.com/geeknik/mmm) — the "Melodic
Metadata Massacrer". It strips metadata from MP3/WAV audio and disrupts acoustic fingerprints so a
track is harder for recognition services to identify. Everything runs **entirely in the browser** and
is served as a static site from **GitHub Pages** — files never leave your device.

## What it does

- **Metadata only (lossless):** strips ID3v2/ID3v1/APE tags (MP3) and non-essential RIFF chunks (WAV),
  preserving the audio bit-for-bit.
- **Turbo / Standard / Paranoid:** apply a pitch shift (and, for Paranoid, a tempo change, band-limiting,
  sync-tone notches, high-frequency attenuation and phase randomization) to break acoustic
  fingerprinting. These re-encode the audio (lossy) and are audible by design.
- **Analyze for watermarks:** echo (cepstrum), spectral flatness, statistical (kurtosis/entropy) and
  high-frequency heuristics.

UI is available in English (default) and French (auto-selected from the browser language).

## Develop

Requires Node 22+.

```bash
npm install      # install dependencies
npm run dev      # Vite dev server
npm test         # Vitest unit tests
npm run lint     # ESLint + Prettier check
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build locally
```

## How it works

Heavy DSP (FFT/STFT, spectral surgery, watermark analysis) is pure TypeScript and runs in a Web Worker.
Compressed-format decode/encode and the pitch/tempo warp use [ffmpeg.wasm](https://ffmpegwasm.netlify.app/)
(single-threaded `@ffmpeg/core`, lazy-loaded ~30 MB) — the multi-threaded core is intentionally avoided
because it needs `SharedArrayBuffer`/COOP+COEP headers that GitHub Pages cannot send. Metadata stripping
is lossless byte-surgery and never routes through ffmpeg. See `CLAUDE.md` for the full code map.

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`/`master`
(and on manual dispatch). One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to the default branch (or run the workflow manually). The site publishes to
   `https://<user>.github.io/mmm-js/`.

The production base path is `/mmm-js/` (set in `vite.config.ts`). If you rename the repository or serve
it elsewhere, override it at build time with the `VITE_BASE` environment variable.

> Note: `@ffmpeg/core` is GPL-2.0-or-later, which affects how the deployed bundle may be licensed.
