import { readFileAsBytes } from '../io/file';
import { downloadBytes, mimeForName } from '../io/download';
import { parseAudio, metadataByteCount } from '../audio';
import type { AudioInfo } from '../audio';
import { analyzeFile } from '../sanitize/process';
import { processWithMode } from '../sanitize/pipeline';
import type { ForensicReport } from '../sanitize/pipeline';
import { MODE_ORDER, isModeName } from '../modes';
import type { ModeName } from '../modes';
import { DspWorkerClient } from '../worker/client';
import { t, setLocale, detectLocale, getLocale } from '../i18n';
import type { MessageKey } from '../i18n';

/** Warn (but still allow) once a file is larger than this — big in-browser DSP can exhaust memory. */
const LARGE_FILE_BYTES = 100 * 1024 * 1024;

const modeLabel = (m: ModeName): string => t(`mode.${m}.label` as MessageKey);
const modeDesc = (m: ModeName): string => t(`mode.${m}.desc` as MessageKey);

/** Mount the single-page UI into the given root element. */
export function mountApp(root: HTMLElement): void {
  setLocale(detectLocale());
  document.documentElement.lang = getLocale();
  document.title = t('app.title');

  root.innerHTML = `
    <header class="masthead">
      <h1 class="wordmark">mmm</h1>
      <p class="tagline">${escapeHtml(t('app.tagline'))}</p>
    </header>

    <label id="drop" class="drop">
      <input id="file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" hidden />
      <span class="drop__icon" aria-hidden="true">♪</span>
      <span class="drop__primary">${escapeHtml(t('drop.primary'))}</span>
      <span class="drop__secondary">${escapeHtml(t('drop.secondary'))}</span>
    </label>

    <section id="report" class="card" hidden></section>

    <footer class="footer">${escapeHtml(t('footer.text'))}</footer>
  `;

  const drop = required<HTMLLabelElement>(root, '#drop');
  const dropPrimary = required<HTMLElement>(root, '.drop__primary');
  const input = required<HTMLInputElement>(root, '#file');
  const report = required<HTMLElement>(root, '#report');

  async function handleFile(file: File): Promise<void> {
    drop.classList.add('has-file');
    dropPrimary.textContent = file.name;

    if (file.size === 0) {
      showError(report, t('error.empty', { name: file.name }));
      return;
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFileAsBytes(file);
    } catch (err) {
      showError(report, t('error.read', { name: file.name, err: message(err) }));
      return;
    }

    try {
      const info = parseAudio(bytes);
      renderReport(report, file.name, bytes, info);
    } catch (err) {
      showError(
        report,
        t('error.unsupported', { name: file.name, err: message(err) }),
        t('error.unsupportedHint')
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
      ? `<p class="warning">${escapeHtml(t('report.largeWarning', { size: formatBytes(info.byteLength) }))}</p>`
      : '';

  el.hidden = false;
  el.innerHTML = `
    <h2 class="filename" title="${escapeHtml(name)}">${escapeHtml(name)}</h2>
    <p class="summary">
      <span class="chip">${info.format.toUpperCase()}</span>
      <span>${formatBytes(info.byteLength)}</span>
      <span>${escapeHtml(t('report.strippableMeta', { size: formatBytes(metaBytes) }))}</span>
    </p>
    ${largeWarning}

    <h3>${escapeHtml(t('report.detectedStructure'))}</h3>
    <table class="regions">
      <thead><tr>
        <th>${escapeHtml(t('report.colRegion'))}</th>
        <th>${escapeHtml(t('report.colKind'))}</th>
        <th class="num">${escapeHtml(t('report.colSize'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <section class="action">
      <h3>${escapeHtml(t('section.process'))}</h3>
      <label class="mode">
        ${escapeHtml(t('section.mode'))}
        <select id="mode">
          ${MODE_ORDER.map((m) => `<option value="${m}">${escapeHtml(modeLabel(m))}</option>`).join('')}
        </select>
      </label>
      <p id="mode-desc" class="note"></p>
      <p class="note">${escapeHtml(t('report.mp3Hint'))}</p>
      <div class="buttons">
        <button id="process" type="button">${escapeHtml(t('btn.process'))}</button>
        <button id="analyze" type="button">${escapeHtml(t('btn.analyze'))}</button>
        <button id="cancel" type="button" hidden>${escapeHtml(t('btn.cancel'))}</button>
      </div>
      <progress id="progress" max="1" value="0" aria-label="${escapeHtml(t('progress.aria'))}" hidden></progress>
      <p id="status" class="note" role="status" aria-live="polite"></p>
      <div id="report-detail"></div>
      <div id="analysis"></div>
    </section>
  `;

  wireProcess(el, name, bytes);
}

function wireProcess(el: HTMLElement, name: string, bytes: Uint8Array): void {
  const mode = required<HTMLSelectElement>(el, '#mode');
  const modeDescEl = required<HTMLElement>(el, '#mode-desc');
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
    modeDescEl.textContent = modeDesc(selectedMode());
  };
  mode.addEventListener('change', syncDesc);
  syncDesc();

  cancelBtn.addEventListener('click', () => dsp.cancel());

  processBtn.addEventListener('click', () => {
    const chosen = selectedMode();
    progress.value = 0;
    progress.hidden = false;
    cancelBtn.hidden = false;
    void withBusy(
      [processBtn, analyzeBtn],
      status,
      t('status.processing', { mode: chosen }),
      async () => {
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
          const state = result.report.verification.passed ? t('status.done') : t('status.doneWarn');
          status.textContent = t('status.result', {
            state,
            name: outName,
            size: formatBytes(result.bytes.length),
          });
          detail.innerHTML = renderForensicReport(result.report);
        } finally {
          progress.hidden = true;
          cancelBtn.hidden = true;
        }
      }
    );
  });

  analyzeBtn.addEventListener('click', () => {
    void withBusy([processBtn, analyzeBtn], status, t('status.analyzing'), async () => {
      const perChannel = await analyzeFile(bytes);
      status.classList.remove('error');
      status.textContent = t('status.analyzed', { n: perChannel.length });
      analysis.innerHTML = perChannel
        .map((a, ch) => {
          const echo = a.echo.detected
            ? t('an.echoAt', { ms: a.echo.lagMs.toFixed(1), s: a.echo.strength.toFixed(1) })
            : t('an.noEcho');
          const stats = a.statistics.flagged
            ? t('an.statsAnomaly', {
                e: a.statistics.entropy.toFixed(1),
                k: a.statistics.excessKurtosis.toFixed(1),
              })
            : t('an.statsNormal');
          const hf = a.highFrequency.flagged
            ? t('an.hfPeaks', { n: a.highFrequency.suspectPeaks })
            : t('an.noHf');
          const channel = t('an.channel', { ch });
          const flatness = t('an.flatness', { v: a.spectralFlatness.toFixed(3) });
          return `<p class="note">${escapeHtml(`${channel}: ${echo}; ${flatness}; ${stats}; ${hf}.`)}</p>`;
        })
        .join('');
    });
  });
}

function renderForensicReport(report: ForensicReport): string {
  const rows: Array<[string, string]> = [
    [t('rep.mode'), modeLabel(report.mode)],
    [t('rep.output'), `${report.outputFormat.toUpperCase()} · ${formatBytes(report.outputSize)}`],
    [t('rep.lossless'), report.lossless ? t('rep.losslessYes') : t('rep.no')],
    [t('rep.metaRemoved'), formatBytes(report.metadata.bytesRemoved)],
  ];
  if (report.pitchPercent !== 0) {
    rows.push([t('rep.pitch'), t('rep.pitchVal', { p: report.pitchPercent })]);
  }
  if (report.tempoPercent !== 0) {
    rows.push([t('rep.tempo'), t('rep.tempoVal', { t: report.tempoPercent })]);
  }
  if (report.spectral) {
    rows.push([
      t('rep.spectral'),
      t('rep.spectralVal', {
        i: report.spectral.intensity,
        f: report.spectral.fftSize,
        p: report.spectral.passes,
      }),
    ]);
  }
  if (report.watermarksBefore.length > 0) {
    const echoes = report.watermarksBefore
      .map((a, ch) =>
        a.echo.detected
          ? t('rep.echoCh', { ch, ms: a.echo.lagMs.toFixed(0) })
          : t('rep.noneCh', { ch })
      )
      .join(', ');
    rows.push([t('rep.watermarks'), echoes]);
  }
  const verdict = report.verification.passed ? t('rep.passed') : t('rep.failed');
  const detail =
    report.verification.residualMetadataBytes === 0
      ? t('rep.clean')
      : t('rep.residual', { n: report.verification.residualMetadataBytes });
  rows.push([t('rep.verification'), `${verdict} — ${detail}`]);

  const body = rows
    .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
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
      status.textContent = t('status.cancelled');
    } else {
      status.classList.add('error');
      status.textContent = t('status.failed', { msg });
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
