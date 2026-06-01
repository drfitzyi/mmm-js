import { readFileAsBytes } from '../io/file';
import { downloadBytes, mimeForName } from '../io/download';
import { parseAudio, metadataByteCount } from '../audio';
import type { AudioInfo } from '../audio';

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
      renderReport(report, file.name, info, () =>
        downloadBytes(bytes, file.name, mimeForName(file.name))
      );
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

function renderReport(
  el: HTMLElement,
  name: string,
  info: AudioInfo,
  onDownload: () => void
): void {
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
    <button id="dl" type="button">Download copy</button>
    <p class="note">Metadata stripping lands in Phase 2 — for now this downloads an unmodified copy.</p>
  `;
  required<HTMLButtonElement>(el, '#dl').addEventListener('click', onDownload);
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
