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

/** Mount the (Phase 1) intake UI into the given root element. */
export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <h1>mmm</h1>
    <p class="tagline">Audio metadata massacrer — runs entirely in your browser. Nothing is uploaded.</p>
    <div id="drop" class="drop">
      <p>Drop an MP3 or WAV here, or choose a file:</p>
      <input id="file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" />
    </div>
    <section id="report" hidden></section>
  `;

  const drop = required<HTMLDivElement>(root, '#drop');
  const input = required<HTMLInputElement>(root, '#file');
  const report = required<HTMLElement>(root, '#report');

  async function handleFile(file: File): Promise<void> {
    const bytes = await readFileAsBytes(file);
    try {
      const info = parseAudio(bytes);
      renderReport(report, file.name, bytes, info);
    } catch (err) {
      report.hidden = false;
      report.innerHTML = `<p class="error">Could not read ${escapeHtml(file.name)}: ${escapeHtml(
        err instanceof Error ? err.message : String(err)
      )}</p>`;
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

  el.hidden = false;
  el.innerHTML = `
    <h2>${escapeHtml(name)}</h2>
    <p>
      Format: <strong>${info.format.toUpperCase()}</strong> ·
      ${formatBytes(info.byteLength)} total ·
      <strong>${formatBytes(metaBytes)}</strong> of strippable metadata detected
    </p>
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
      <div class="buttons">
        <button id="process" type="button">Process &amp; download</button>
        <button id="analyze" type="button">Analyze for watermarks</button>
        <button id="cancel" type="button" hidden>Cancel</button>
      </div>
      <progress id="progress" max="1" value="0" hidden></progress>
      <p id="status" class="note" role="status"></p>
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
