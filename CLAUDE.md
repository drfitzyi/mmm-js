# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 0 (scaffolding) is complete. The app is a **Vite + TypeScript** static site; see `TODO.md` for
the phased build plan. No audio processing exists yet — `src/main.ts` is a placeholder entry point.

## Commands

- `npm run dev` — start the Vite dev server (base path `/`).
- `npm run build` — typecheck (`tsc --noEmit`) then build to `dist/` (base path `/mmm-js/` for Pages).
- `npm run preview` — serve the production build locally.
- `npm test` — run the Vitest suite once. `npm run test:watch` for watch mode.
- Run a single test file: `npx vitest run src/path/to/file.test.ts`.
- `npm run lint` — ESLint + Prettier check. `npm run format` — auto-format with Prettier.

## Key configuration notes

- **GitHub Pages base path**: `vite.config.ts` sets `base` to `/mmm-js/` for production builds and `/`
  for dev/preview. If the repo is renamed or served elsewhere, override via the `VITE_BASE` env var.
  Worker and WASM URLs must resolve under this base — use `import.meta.url`-relative references, not
  absolute `/` paths.
- Workers are built as ES modules (`worker.format: 'es'` in `vite.config.ts`).
- Prettier ignores `*.md` and `.claude/` (hand-maintained); ESLint uses flat config (`eslint.config.js`).

## Goal

Port the Python CLI tool **mmm** ("Melodic Metadata Massacrer", https://github.com/geeknik/mmm) to
JavaScript so it runs **entirely in the browser**, served as a static site from **GitHub Pages**.

mmm strips metadata from MP3/WAV audio and applies spectral modifications intended to disrupt patterns
that audio fingerprinting / AI-detection systems rely on. Core capabilities to reproduce:

- Metadata removal (ID3, RIFF INFO, FLAC tags)
- Watermark detection (spread-spectrum, echo-based, statistical)
- Spectral modification / fingerprint elimination
- Forensic analysis and verification of the result

## Hard architectural constraint: client-side only

GitHub Pages serves **static files only** — there is no backend. Everything must run in the browser:

- All audio processing happens client-side. The original Python relies on NumPy/SciPy/CUDA and a local
  server (`localhost:8778`); none of that is available. Plan for the **Web Audio API**, `AudioContext`
  / `OfflineAudioContext` for spectral work, and `WebAssembly` where heavy DSP justifies it.
- Files are read via `<input type="file">` / drag-and-drop and `ArrayBuffer`; results are returned to
  the user with a client-side download (e.g. `Blob` + object URL). Nothing is uploaded.
- The upstream "server mode" / web interface becomes the *primary and only* UI here.
- The upstream CPU/GPU performance characteristics do not transfer — expect to manage long-running DSP
  off the main thread (Web Workers) to keep the UI responsive.

When mapping upstream Python modules (`AudioSanitizer`, `PreservingSanitizer`/turbo mode,
`WatermarkDetector`, `SpectralCleaner`, `MetadataCleaner`) into JS, preserve the layered design:
UI → core processing → detection modules → sanitization modules.

## Code map (current)

Source is layered so the heavy logic stays pure and unit-testable in Node; only the codec bridge and
download touch browser APIs.

- `src/audio/` — container layer. `format.ts` (magic-byte detection), `wav.ts` (RIFF chunk parse +
  `buildWav` writer), `mp3.ts` (ID3v2/APEv2/ID3v1 tag-region locator), `pcm.ts` (WAV↔Float32 PCM codec),
  `binary.ts` (`ByteReader`). `index.ts` re-exports + `parseAudio` dispatcher. Unified `Region` model
  (`header`/`audio`/`metadata`) in `types.ts`.
- `src/dsp/` — **pure DSP, no browser deps.** `fft.ts` (radix-2 FFT), `window.ts` (Hann), `stft.ts`
  (overlap-add STFT with a per-frame transform callback), `spectral.ts` (`SpectralCleaner` — Hermitian-
  symmetry-preserving jitter), `watermark.ts` (cepstrum echo detector + spectral flatness), `prng.ts`
  (seeded mulberry32 so output is reproducible/testable).
- `src/sanitize/` — orchestration. `metadata.ts` (lossless tag stripping), `spectral.ts` (pure WAV
  clean/analyze), `process.ts` (format-aware: WAV pure, MP3 via ffmpeg.wasm).
- `src/audio/ffmpeg.ts` — **browser-only** ffmpeg.wasm bridge (decode/encode). Dynamically imported so
  the ~30 MB core is lazy. Cannot be exercised under Vitest.
- `src/io/` — `file.ts` (read File→bytes), `download.ts` (Blob + object URL). `src/ui/app.ts` — the UI.

Conventions: `noUncheckedIndexedAccess` is on, so typed-array indexing returns `number | undefined` —
cache reads into locals with `!` in DSP hot loops (see `fft.ts`). Keep new heavy logic in `dsp`/`audio`
as pure functions over `Float32Array`/`Uint8Array` and add Vitest coverage; keep browser-only glue thin.

## ffmpeg.wasm

Used only as the MP3 codec bridge — **metadata stripping never routes through it** (that path is
lossless byte-surgery). Must stay on the **single-threaded** `@ffmpeg/core` (no SharedArrayBuffer), since
GitHub Pages cannot send the COOP/COEP headers the multi-threaded core requires. The core is **GPL-2.0**,
which affects how the deployed bundle may be licensed/distributed.

## Reference

- Upstream Python implementation: https://github.com/geeknik/mmm — consult it for algorithm details
  and the exact metadata/spectral behaviors to match.
