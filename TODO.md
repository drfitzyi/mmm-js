# TODO — Port mmm to a browser-based JS app

Goal: reimplement [geeknik/mmm](https://github.com/geeknik/mmm) (audio metadata stripping + spectral
modification) so it runs **entirely client-side** and is hosted as a static site on **GitHub Pages**.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Project scaffolding ✅
- [x] Pick the stack: **Vite + TypeScript**, vanilla UI for now.
- [x] `npm init`, install toolchain (`package.json` + `package-lock.json`).
- [x] Set up scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `test:watch`.
- [x] Configure lint/format (ESLint flat config + Prettier) and a test runner (Vitest) — smoke test passes.
- [x] Add `vite.config.ts` with correct `base` path for GitHub Pages project sites (`/mmm-js/`).
- [x] Update `CLAUDE.md` with the real build/lint/test commands.

## Phase 1 — Audio I/O foundation (no processing yet) ✅
- [x] File intake: `<input type="file">` + drag-and-drop, read to `ArrayBuffer`. Accept MP3 and WAV. (`src/io/file.ts`, `src/ui/app.ts`)
- [x] Decode/inspect: detect container/format from bytes (don't trust extension). (`src/audio/format.ts`)
- [x] WAV parser/writer (RIFF chunks) — chunk parser + `buildWav` that recomputes sizes. (`src/audio/wav.ts`)
- [x] MP3 frame parser — locate audio frames vs. metadata regions (ID3v2/ID3v1/APEv2). (`src/audio/mp3.ts`)
- [x] Result download via `Blob` + object URL. (`src/io/download.ts`)
- [x] Unified `Region` model (`header`/`audio`/`metadata`) + `parseAudio` dispatcher feeding the UI breakdown. (`src/audio/index.ts`, `src/audio/types.ts`)
- [ ] Manual check: confirm in-browser that the network tab stays silent on the deployed/dev build.

## Phase 2 — Metadata removal (the core, highest-value feature)
- [ ] Strip ID3v2 (leading) and ID3v1 (trailing 128 bytes) tags from MP3.
- [ ] Strip RIFF `INFO`/`LIST` and other non-audio chunks from WAV.
- [ ] Strip FLAC tags (Vorbis comments) if FLAC support is in scope — otherwise note as out of scope.
- [ ] Re-emit a clean file with only the audio payload + minimal required headers.
- [ ] Verify: re-parse output and assert zero residual metadata.

## Phase 3 — Spectral analysis & modification (Web Audio / DSP)
- [ ] Decode audio to PCM samples via `AudioContext.decodeAudioData` (or a WASM decoder for fidelity).
- [ ] Implement FFT-based analysis using `OfflineAudioContext` / a WASM FFT lib.
- [ ] Port `SpectralCleaner`: frequency-domain modifications / fingerprint disruption.
- [ ] Port `WatermarkDetector`: spread-spectrum, echo-based, and statistical detection methods.
- [ ] Re-encode modified PCM back to WAV (lossless) and MP3 (via a WASM encoder, e.g. lamejs/libmp3lame-wasm).

## Phase 4 — Processing modes (match upstream behavior)
- [ ] Standard mode — full analysis + sanitization.
- [ ] Turbo mode — faster, metadata-preserving-where-safe variant (`PreservingSanitizer`).
- [ ] Paranoid mode — maximum modification intensity.
- [ ] Forensic verification — report what was removed/changed and confirm the result.

## Phase 5 — Performance (keep the UI alive)
- [ ] Move all DSP off the main thread into a **Web Worker**; stream progress back to the UI.
- [ ] Use transferable `ArrayBuffer`s to avoid copies between worker and main thread.
- [ ] Show progress + cancel for long-running jobs (upstream ~70s for a 3.5-min MP3 — expect long waits).

## Phase 6 — UI
- [ ] Single-page interface: drop zone, mode selector, progress, before/after report, download.
- [ ] Surface the forensic/verification output to the user.
- [ ] Handle errors gracefully (unsupported format, decode failure, oversized files).

## Phase 7 — Deploy to GitHub Pages
- [ ] GitHub Actions workflow: build on push to `main`, publish `dist/` to Pages.
- [ ] Verify the `base` path so assets/workers/WASM resolve correctly on the Pages URL.
- [ ] Smoke-test the deployed site end-to-end with a real MP3 and WAV.

---

## Open questions / decisions to make
- [ ] Which features are in scope for v1? (Suggest: metadata removal first; spectral mods second.)
- [ ] FLAC support — in or out?
- [ ] MP3 re-encoding: WASM encoder choice and its licensing implications.
- [ ] How faithfully must spectral/watermark algorithms match the Python output vs. achieve the same goal?
- [ ] File size ceiling given browser memory limits.

## Reference
- Upstream Python source: https://github.com/geeknik/mmm — consult for exact algorithms and behaviors.
- Upstream module map to preserve: UI → core processing → detection (`WatermarkDetector`) →
  sanitization (`MetadataCleaner`, `SpectralCleaner`, `AudioSanitizer`/`PreservingSanitizer`).
