import { readFileAsBytes } from '../io/file';
import { downloadBytes, mimeForName } from '../io/download';
import { parseAudio, metadataByteCount } from '../audio';
import type { AudioInfo } from '../audio';
import { stripMetadata } from '../sanitize/metadata';
import { spectralCleanFile, analyzeFile } from '../sanitize/process';

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
      <h3>Strip metadata</h3>
      <p class="note">Lossless: removes tags, keeps the audio bit-for-bit.</p>
      <button id="strip" type="button">Strip metadata &amp; download</button>
      <p id="strip-status" class="note" role="status"></p>
    </section>

    <section class="action">
      <h3>Disrupt fingerprints (spectral)</h3>
      <p class="note">
        Applies randomized spectral perturbations. WAV is processed losslessly in-page;
        MP3 is decoded and re-encoded with ffmpeg.wasm (≈30&nbsp;MB, loaded once on first use)
        and is therefore lossy.
      </p>
      <label class="intensity">
        Intensity
        <input id="intensity" type="range" min="0" max="1" step="0.05" value="0.2" />
        <output id="intensity-out">0.20</output>
      </label>
      <div class="buttons">
        <button id="clean" type="button">Clean spectra &amp; download</button>
        <button id="analyze" type="button">Analyze for watermarks</button>
      </div>
      <p id="spectral-status" class="note" role="status"></p>
      <div id="analysis"></div>
    </section>
  `;

  wireStrip(el, name, bytes);
  wireSpectral(el, name, bytes);
}

function wireStrip(el: HTMLElement, name: string, bytes: Uint8Array): void {
  const status = required<HTMLElement>(el, '#strip-status');
  required<HTMLButtonElement>(el, '#strip').addEventListener('click', () => {
    try {
      const result = stripMetadata(bytes);
      const outName = withSuffix(name, '.stripped');
      downloadBytes(result.bytes, outName, mimeForName(name));
      status.classList.remove('error');
      status.textContent =
        result.bytesRemoved > 0
          ? `Removed ${formatBytes(result.bytesRemoved)} of metadata → ${escapeHtml(outName)} (${formatBytes(result.bytes.length)}).`
          : `No metadata to remove — downloaded an exact copy as ${escapeHtml(outName)}.`;
    } catch (err) {
      status.classList.add('error');
      status.textContent = `Could not strip metadata: ${message(err)}`;
    }
  });
}

function wireSpectral(el: HTMLElement, name: string, bytes: Uint8Array): void {
  const intensity = required<HTMLInputElement>(el, '#intensity');
  const intensityOut = required<HTMLOutputElement>(el, '#intensity-out');
  const cleanBtn = required<HTMLButtonElement>(el, '#clean');
  const analyzeBtn = required<HTMLButtonElement>(el, '#analyze');
  const status = required<HTMLElement>(el, '#spectral-status');
  const analysis = required<HTMLElement>(el, '#analysis');

  intensity.addEventListener('input', () => {
    intensityOut.textContent = Number(intensity.value).toFixed(2);
  });

  cleanBtn.addEventListener('click', () => {
    void withBusy([cleanBtn, analyzeBtn], status, 'Processing…', async () => {
      const result = await spectralCleanFile(bytes, { intensity: Number(intensity.value) });
      const outName = withSuffix(name, '.cleaned');
      downloadBytes(result.bytes, outName, mimeForName(name));
      status.classList.remove('error');
      status.textContent = `Cleaned → ${escapeHtml(outName)} (${formatBytes(result.bytes.length)}, ${result.outputFormat.toUpperCase()}).`;
    });
  });

  analyzeBtn.addEventListener('click', () => {
    void withBusy([cleanBtn, analyzeBtn], status, 'Analyzing…', async () => {
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
    status.classList.add('error');
    status.textContent = `Failed: ${message(err)}`;
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
