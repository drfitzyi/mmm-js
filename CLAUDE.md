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

## Reference

- Upstream Python implementation: https://github.com/geeknik/mmm — consult it for algorithm details
  and the exact metadata/spectral behaviors to match.
