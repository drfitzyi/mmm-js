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

## Phase 2 — Metadata removal (the core, highest-value feature) ✅
- [x] Strip ID3v2 (leading) + APEv2 and ID3v1 (trailing) tags from MP3 — keep only the audio span. (`src/sanitize/metadata.ts`)
- [x] Strip RIFF `INFO`/`LIST` and other non-essential chunks from WAV via `buildWav`. (`src/sanitize/metadata.ts`)
- [ ] FLAC tags (Vorbis comments) — **out of scope** for now (FLAC not yet a supported input format).
- [x] Re-emit a clean file with only the audio payload + minimal required headers.
- [x] Verify: re-parse output and assert zero residual metadata (built into `stripMetadata` as a safety net + tested).
- [x] Wire "Strip metadata & download" into the UI with bytes-removed feedback. (`src/ui/app.ts`)

## Phase 3 — Spectral analysis & modification (Web Audio / DSP) ✅
- [x] Decode audio to PCM: WAV in pure TS (`src/audio/pcm.ts`); MP3 via ffmpeg.wasm (`src/audio/ffmpeg.ts`).
- [x] Own FFT/STFT in pure TS — no Web Audio dependency, fully unit-tested. (`src/dsp/fft.ts`, `src/dsp/stft.ts`)
- [x] Port `SpectralCleaner`: symmetry-preserving magnitude/phase jitter (fingerprint disruption). (`src/dsp/spectral.ts`)
- [x] Port `WatermarkDetector`: cepstrum echo detection + spectral-flatness statistic. (`src/dsp/watermark.ts`)
- [x] Re-encode to WAV (lossless, pure) and MP3 (ffmpeg.wasm + libmp3lame). (`src/audio/pcm.ts`, `src/audio/ffmpeg.ts`)
- [x] Format-aware pipeline + UI controls (intensity slider, clean, analyze). (`src/sanitize/process.ts`, `src/ui/app.ts`)
- **Decision:** use ffmpeg.wasm **single-threaded** core (`@ffmpeg/core`) — the MT core needs SharedArrayBuffer
  (COOP/COEP headers) which GitHub Pages can't set. Core is GPL-2.0 and lazy-loaded (~30 MB) only on MP3 use.
- [ ] **Browser verification pending**: the ffmpeg MP3 decode→clean→encode round-trip is typed + builds, but
  has only been validated via the bundler, not run in a real browser. Needs a manual in-page test.
- [ ] Consider moving DSP off the main thread (Web Worker) — see Phase 5; long files will block the UI today.

## Recognition reality (learned from testing)
Per-bin spectral magnitude/phase jitter does **not** defeat acoustic fingerprinting (verified: a
paranoid-mode song was still recognized by songfinder.gg) — matchers key on spectral-peak constellations
and ignore phase. The effective breaker is a **pitch shift** (a few %, audible), done via ffmpeg. So all
modes except `metadata` now warp pitch (lossy, require ffmpeg even for WAV).

After comparing with upstream `geeknik/mmm`, added parity techniques:
- **Tempo change** (ffmpeg `atempo`) — second recognition-breaker (paranoid uses ~−3%). (`audio/ffmpeg.ts` warp)
- **DSP spectral surgery**: band-limiting (HP/LP), sync-tone notches, HF watermark attenuation, and
  strong phase randomization. (`dsp/spectral.ts`; standard = notches + HF, paranoid = all of it)
- **Expanded watermark detection**: statistical (kurtosis/entropy) + high-frequency spread-spectrum
  profile, alongside the existing cepstrum echo + spectral flatness. (`dsp/watermark.ts`)

Still not ported from upstream: FLAC input, multiband noise injection, "human imperfections"
(micro-timing/harmonic), full 0–2π phase randomization (we cap at the `phaseRandom` knob).

## Phase 4 — Processing modes (match upstream behavior) ✅
- [x] Mode presets: `metadata` (lossless), `turbo`, `standard`, `paranoid`. (`src/modes.ts`)
- [x] Standard mode — balanced spectral disruption + metadata drop via re-encode.
- [x] Turbo mode — light, small-FFT spectral pass (fast).
- [x] Paranoid mode — aggressive multi-pass, large-FFT disruption.
- [x] Forensic verification — `ForensicReport` (metadata removed, spectral params, watermarks-before,
      re-parse residual check). (`src/sanitize/pipeline.ts`)
- [x] `processWithMode` unified pipeline + UI mode selector rendering the report. (`src/sanitize/pipeline.ts`, `src/ui/app.ts`)
- Note: multi-pass spectral runs in the PCM domain (one decode/encode); seeds vary per channel and per pass.
- [ ] Browser verification of the MP3 spectral modes still pending (shared with Phase 3 — ffmpeg path).

## Phase 5 — Performance (keep the UI alive) ✅
- [x] Move the heavy DSP off the main thread into a **Web Worker**. (`src/worker/dsp.worker.ts`, `src/worker/client.ts`)
      ffmpeg already runs in its own worker, so MP3 decode/encode never blocked the main thread — only our
      DSP did. Orchestration stays on the main thread to avoid fragile nested workers.
- [x] Transfer `ArrayBuffer`s to the worker (copy-then-transfer so the UI's retained bytes aren't detached).
- [x] Progress (threaded through `processStft`→`spectralClean`→`cleanWavSpectra`) + Cancel (worker
      `terminate()`, since GitHub Pages has no SharedArrayBuffer for a cooperative cancel flag). (`src/ui/app.ts`)
- [x] Injectable `DspRunner` so `processWithMode` uses the worker in the UI but stays synchronous/testable.
- Note: Cancel aborts the DSP stage; for MP3 it can't interrupt an in-flight ffmpeg decode/encode (separate worker).
- [ ] Browser verification of worker progress/cancel still pending (shared with the ffmpeg in-browser check).

## Phase 6 — UI ✅
- [x] Single-page interface: masthead, clickable/drop label zone (reflects loaded file), mode selector,
      progress bar + cancel, detected-structure table, forensic result, download. (`src/ui/app.ts`, `src/style.css`)
- [x] Surface the forensic/verification output (mode, output, lossless, metadata removed, spectral params,
      input watermarks, verification pass/fail) as a table.
- [x] Graceful errors: unsupported format (with a hint), empty file, read failure, large-file warning.
- [x] Distinctive restrained styling with design tokens + light/dark; accessible progress/status (aria-live).

## Localization ✅
- [x] i18n layer (`src/i18n.ts`): English (default) + French, chosen from `navigator.language` (fr* → fr).
- [x] All UI strings + mode labels/descriptions routed through `t()`; `<html lang>` and `<title>` set at mount.

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
