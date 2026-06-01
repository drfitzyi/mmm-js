# mmm-js

A browser-based JavaScript port of [geeknik/mmm](https://github.com/geeknik/mmm) — the **M**elodic
**M**etadata **M**assacrer. It strips metadata from MP3/WAV audio and disrupts acoustic fingerprints so a
track is harder for recognition services (Shazam-style matchers) to identify.

Everything runs **entirely in your browser** and is served as a static site from **GitHub Pages** — your
files never leave your device, and there is no backend.

## Features

- **Metadata stripping (lossless).** Removes ID3v2 / ID3v1 / APE tags from MP3 and non-essential RIFF
  chunks (`LIST`/`INFO`, etc.) from WAV, keeping the audio payload bit-for-bit. The output is re-parsed
  to verify nothing remains.
- **Acoustic-fingerprint disruption (lossy).** A pitch shift moves the spectral peaks recognition keys
  on; stronger modes add a tempo change, band-limiting, sync-tone notches, high-frequency attenuation
  and phase randomization.
- **Watermark analysis.** Per-channel echo detection (cepstrum), spectral flatness, statistical anomaly
  (kurtosis / entropy) and a high-frequency spread-spectrum profile.
- **Forensic report.** After processing, shows exactly what changed (metadata removed, pitch/tempo,
  spectral settings) and a pass/fail verification.
- **Bilingual UI.** English (default) and French, auto-selected from the browser language.
- **Responsive, off-thread.** Heavy DSP runs in a Web Worker with a progress bar and cancel.

## Modes

| Mode | What it does | Audible? | Lossless? |
|------|--------------|----------|-----------|
| **Metadata only** | Strip tags / chunks; audio untouched. Does *not* defeat recognition. | No | ✅ |
| **Turbo** | ~3% pitch shift. Mildest change. | Slight | ✗ |
| **Standard** | ~4.5% pitch shift + sync-tone notches + HF watermark attenuation. | Slight | ✗ |
| **Paranoid** | ~7% pitch shift, ~3% tempo change, band-limiting, notches, strong phase randomization (2 passes). | Yes | ✗ |

> **Reality check:** defeating a robust audio fingerprinter is an adversarial, audible trade-off.
> Imperceptible processing (small spectral nudges) does *not* fool these systems by design — the pitch /
> tempo changes that work are meant to be heard. "Metadata only" is lossless but has no effect on
> content-based recognition. Effectiveness against any specific service is not guaranteed.

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

## Architecture

The product logic is pure TypeScript over `Float32Array` / `Uint8Array` and fully unit-tested; only the
codec bridge and file download touch browser APIs. See `CLAUDE.md` for the full code map.

- `src/audio/` — container layer: format detection, WAV chunk parse + writer, MP3 tag-region locator,
  WAV↔PCM codec.
- `src/dsp/` — pure DSP: FFT, STFT, spectral surgery/perturbation, watermark detection, seeded PRNG.
- `src/sanitize/` — orchestration: lossless metadata strip, spectral pipeline, mode-driven `processWithMode`.
- `src/worker/` — the DSP Web Worker and its client.
- `src/audio/ffmpeg.ts` — ffmpeg.wasm bridge (decode/encode/pitch/tempo).
- `src/i18n.ts` — English/French strings. `src/ui/app.ts` — the UI.

**Why ffmpeg.wasm single-threaded:** the multi-threaded core needs `SharedArrayBuffer`, which requires
COOP/COEP headers GitHub Pages can't send. The single-threaded `@ffmpeg/core` (~30 MB) is lazy-loaded
only when a lossy mode runs; metadata stripping is byte-surgery and never re-encodes.

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`/`master` (and on
manual dispatch). One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to the default branch (or run the workflow manually). The site publishes to
   `https://<user>.github.io/mmm-js/`.

The production base path is `/mmm-js/` (in `vite.config.ts`). If you rename the repo or host it
elsewhere, override it at build time with the `VITE_BASE` environment variable.

## Credits & license

Port of [geeknik/mmm](https://github.com/geeknik/mmm). Decoding/encoding uses
[ffmpeg.wasm](https://ffmpegwasm.netlify.app/); note that `@ffmpeg/core` is **GPL-2.0-or-later**, which
affects how the deployed bundle may be licensed and distributed.
