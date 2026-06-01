/**
 * Trigger a client-side download of `bytes`. Everything stays in the browser —
 * the data is wrapped in a Blob and handed to the user via an object URL.
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/octet-stream'
): void {
  // Copy into a fresh ArrayBuffer-backed view so the Blob owns plain bytes
  // regardless of how the source Uint8Array was sliced.
  const part = bytes.slice();
  const blob = new Blob([part], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Map an audio format to a sensible download MIME type. */
export function mimeForName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}
