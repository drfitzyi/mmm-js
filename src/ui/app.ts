import { readFileAsBytes } from '../io/file';
import { downloadBytes, mimeForName } from '../io/download';
import { parseAudio, metadataByteCount } from '../audio';
import type { AudioInfo } from '../audio';
import { analyzeFile } from '../sanitize/process';
import { processWithMode } from '../sanitize/pipeline';
import type { ForensicReport } from '../sanitize/pipeline';
import { MODES, MODE_ORDER, isModeName } from '../modes';
import type { ModeName } from '../modes';
import { DspWorkerClient } from '../worker/client';

/** Warn (but still allow) once a file is larger than this — big in-browser DSP can exhaust memory. */
const LARGE_FILE_BYTES = 100 * 1024 * 1024;

/** Mount the single-page UI into the given root element. */
export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="masthead">
      <h1 class="wordmark">mmm</h1>
      <p class="tagline">
        Melodic&nbsp;Metadata&nbsp;Massacrer — strip tags and disrupt audio fingerprints,
        entirely in your browser.
      </p>
    </header>

    <label id="drop" class="drop">
      <input id="file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" hidden />
      <span class="drop__icon" aria-hidden="true">♪</span>
      <span class="drop__primary">Drop an MP3 or WAV here</span>
      <span class="drop__secondary">or click to choose a file</span>
    </label>

    <section id="report" class="card" hidden></section>

    <footer class="footer">
      Files never leave your device — everything runs locally. MP3 support loads ffmpeg.wasm
      (~30&nbsp;MB) on first use.
    </footer>
  `;

  const drop = required<HTMLLabelElement>(root, '#drop');
  const dropPrimary = required<HTMLElement>(root, '.drop__primary');
  const input = required<HTMLInputElement>(root, '#file');
  const report = required<HTMLElement>(root, '#report');

  async function handleFile(file: File): Promise<void> {
    drop.classList.add('has-file');
    dropPrimary.textContent = file.name;

    if (file.size === 0) {
      showError(report, `${file.name} is empty.`);
      return;
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFileAsBytes(file);
    } catch (err) {
      showError(report, `Could not read ${file.name}: ${message(err)}`);
      return;
    }

    try {
      const info = parseAudio(bytes);
      renderReport(report, file.name, bytes, info);
    } catch (err) {
      showError(
        report,
        `${file.name} is not a supported MP3 or WAV (${message(err)}).`,
        'Supported inputs: MP3 (with or without ID3/APE tags) and PCM/float WAV.'
      );
    }
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void handleFile(file);
  });

  for (const evt of ['dragenter', 'dragover'] as const) {
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
  }
  for (const evt of ['dragleave', 'drop'] as const) {
    drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    });
  }
  drop.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
}

function showError(report: HTMLElement, message: string, hint?: string): void {
  report.hidden = false;
  report.innerHTML = `
    <p class="error">${escapeHtml(message)}</p>
    ${hint ? `<p class="note">${escapeHtml(hint)}</p>` : ''}
  `;
}

function renderReport(el: HTMLElement, name: string, bytes: Uint8Array, info: AudioInfo): void {
  const metaBytes = metadataByteCount(info);
  const rows = info.regions
    .map(
      (r) => `
      <tr class="region region--${r.kind}">
        <td>${escapeHtml(r.label)}</td>
        <td>${r.kind}</td>
        <td class="num">${formatBytes(r.length)}</td>
      </tr>`
    )
    .join('');

  const largeWarning =
    info.byteLength > LARGE_FILE_BYTES
      ? `<p class="warning">Large file (${formatBytes(info.byteLength)}). Spectral processing happens in memory and may be slow or hit browser limits.</p>`
      : '';

  const mp3Hint = `<p class="note">
      Every mode except <em>Metadata only</em> shifts pitch to defeat acoustic recognition — this is
      audible (a slight key change) and re-encodes via ffmpeg.wasm (~30&nbsp;MB, loaded once on first use),
      even for WAV. <em>Metadata only</em> is lossless but does not affect recognition.
    </p>`;

  el.hidden = false;
  el.innerHTML = `
    <h2 class="filename" title="${escapeHtml(name)}">${escapeHtml(name)}</h2>
    <p class="summary">
      <span class="chip">${info.format.toUpperCase()}</span>
      <span>${formatBytes(info.byteLength)}</span>
      <span><strong>${formatBytes(metaBytes)}</strong> strippable metadata</span>
    </p>
    ${largeWarning}

    <h3>Detected structure</h3>
    <table class="regions">
      <thead><tr><th>Region</th><th>Kind</th><th class="num">Size</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="action">
      <h3>Process</h3>
      <label class="mode">
        Mode
        <select id="mode">
          ${MODE_ORDER.map((m) => `<option value="${m}">${escapeHtml(MODES[m].label)}</option>`).join('')}
        </select>
      </label>
      <p id="mode-desc" class="note"></p>
      ${mp3Hint}
      <div class="buttons">
        <button id="process" type="button">Process &amp; download</button>
        <button id="analyze" type="button">Analyze for watermarks</button>
        <button id="cancel" type="button" hidden>Cancel</button>
      </div>
      <progress id="progress" max="1" value="0" aria-label="Processing progress" hidden></progress>
      <p id="status" class="note" role="status" aria-live="polite"></p>
      <div id="report-detail"></div>
      <div id="analysis"></div>
    </section>
  `;

  wireProcess(el, name, bytes);
}

function wireProcess(el: HTMLElement, name: string, bytes: Uint8Array): void {
  const mode = required<HTMLSelectElement>(el, '#mode');
  const modeDesc = required<HTMLElement>(el, '#mode-desc');
  const processBtn = required<HTMLButtonElement>(el, '#process');
  const analyzeBtn = required<HTMLButtonElement>(el, '#analyze');
  const cancelBtn = required<HTMLButtonElement>(el, '#cancel');
  const progress = required<HTMLProgressElement>(el, '#progress');
  const status = required<HTMLElement>(el, '#status');
  const detail = required<HTMLElement>(el, '#report-detail');
  const analysis = required<HTMLElement>(el, '#analysis');

  // One worker client per file view; the heavy DSP runs off the main thread.
  const dsp = new DspWorkerClient();

  const selectedMode = (): ModeName => (isModeName(mode.value) ? mode.value : 'standard');
  const syncDesc = (): void => {
    modeDesc.textContent = MODES[selectedMode()].description;
  };
  mode.addEventListener('change', syncDesc);
  syncDesc();

  cancelBtn.addEventListener('click', () => dsp.cancel());

  processBtn.addEventListener('click', () => {
    const chosen = selectedMode();
    progress.value = 0;
    progress.hidden = false;
    cancelBtn.hidden = false;
    void withBusy([processBtn, analyzeBtn], status, `Processing (${chosen})…`, async () => {
      try {
        const result = await processWithMode(
          bytes,
          chosen,
          { onProgress: (ratio) => (progress.value = ratio) },
          dsp
        );
        const outName = withSuffix(name, `.${chosen}`);
        downloadBytes(result.bytes, outName, mimeForName(name));
        status.classList.remove('error');
        status.textContent = `${result.report.verification.passed ? 'Done' : 'Done (with warnings)'} → ${escapeHtml(outName)} (${formatBytes(result.bytes.length)}).`;
        detail.innerHTML = renderForensicReport(result.report);
      } finally {
        progress.hidden = true;
        cancelBtn.hidden = true;
      }
    });
  });

  analyzeBtn.addEventListener('click', () => {
    void withBusy([processBtn, analyzeBtn], status, 'Analyzing…', async () => {
      const perChannel = await analyzeFile(bytes);
      status.classList.remove('error');
      status.textContent = `Analyzed ${perChannel.length} channel(s).`;
      analysis.innerHTML = perChannel
        .map((a, ch) => {
          const echo = a.echo.detected
            ? `echo at ${a.echo.lagMs.toFixed(1)} ms (strength ${a.echo.strength.toFixed(1)})`
            : 'no echo detected';
          return `<p class="note">Channel ${ch}: ${echo}; spectral flatness ${a.spectralFlatness.toFixed(3)}.</p>`;
        })
        .join('');
    });
  });
}

function renderForensicReport(report: ForensicReport): string {
  const rows: Array<[string, string]> = [
    ['Mode', report.mode],
    ['Output', `${report.outputFormat.toUpperCase()} · ${formatBytes(report.outputSize)}`],
    ['Lossless', report.lossless ? 'yes (audio preserved bit-for-bit)' : 'no'],
    ['Metadata removed', `${formatBytes(report.metadata.bytesRemoved)}`],
  ];
  if (report.pitchPercent > 0) {
    rows.push(['Pitch shift', `~${report.pitchPercent}% (breaks acoustic fingerprints)`]);
  }
  if (report.spectral) {
    rows.push([
      'Spectral',
      `intensity ${report.spectral.intensity}, FFT ${report.spectral.fftSize}, ${report.spectral.passes} pass(es)`,
    ]);
  }
  if (report.watermarksBefore.length > 0) {
    const echoes = report.watermarksBefore
      .map((a, ch) =>
        a.echo.detected ? `ch${ch}: echo ${a.echo.lagMs.toFixed(0)}ms` : `ch${ch}: none`
      )
      .join(', ');
    rows.push(['Watermarks (input)', echoes]);
  }
  rows.push([
    'Verification',
    `${report.verification.passed ? 'passed' : 'FAILED'} — ${escapeHtml(report.verification.notes.join(' '))}`,
  ]);

  const body = rows
    .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${v}</td></tr>`)
    .join('');
  return `<table class="report"><tbody>${body}</tbody></table>`;
}

/** Disable buttons and show a status while an async action runs. */
async function withBusy(
  buttons: HTMLButtonElement[],
  status: HTMLElement,
  busyText: string,
  action: () => Promise<void>
): Promise<void> {
  for (const b of buttons) b.disabled = true;
  status.classList.remove('error');
  status.textContent = busyText;
  try {
    await action();
  } catch (err) {
    const msg = message(err);
    if (msg === 'Cancelled') {
      status.classList.remove('error');
      status.textContent = 'Cancelled.';
    } else {
      status.classList.add('error');
      status.textContent = `Failed: ${msg}`;
    }
  } finally {
    for (const b of buttons) b.disabled = false;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Insert `suffix` before the file extension: ("song.mp3", ".stripped") → "song.stripped.mp3". */
function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + suffix;
  return name.slice(0, dot) + suffix + name.slice(dot);
}

function required<T extends Element>(scope: ParentNode, selector: string): T {
  const found = scope.querySelector<T>(selector);
  if (!found) throw new Error(`Missing required element: ${selector}`);
  return found;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}
