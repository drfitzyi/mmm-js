// Minimal i18n: English (default) and French, chosen from the browser language.
// All user-facing strings live in MESSAGES so there's a single source of truth.

export type Locale = 'en' | 'fr';

type Entry = Record<Locale, string>;

const MESSAGES = {
  'app.title': {
    en: 'mmm — audio metadata massacrer',
    fr: 'mmm — broyeur de métadonnées audio',
  },
  'app.tagline': {
    en: 'Melodic Metadata Massacrer — strip tags and disrupt audio fingerprints, entirely in your browser.',
    fr: 'Melodic Metadata Massacrer — supprimez les métadonnées et perturbez les empreintes audio, entièrement dans votre navigateur.',
  },
  'drop.primary': {
    en: 'Drop an MP3 or WAV here',
    fr: 'Déposez un MP3 ou un WAV ici',
  },
  'drop.secondary': {
    en: 'or click to choose a file',
    fr: 'ou cliquez pour choisir un fichier',
  },
  'footer.text': {
    en: 'Files never leave your device — everything runs locally. MP3 support loads ffmpeg.wasm (~30 MB) on first use.',
    fr: "Vos fichiers ne quittent jamais votre appareil — tout s'exécute localement. La prise en charge du MP3 charge ffmpeg.wasm (~30 Mo) à la première utilisation.",
  },

  'error.empty': { en: '{name} is empty.', fr: '{name} est vide.' },
  'error.read': { en: 'Could not read {name}: {err}', fr: 'Impossible de lire {name} : {err}' },
  'error.unsupported': {
    en: '{name} is not a supported MP3 or WAV ({err}).',
    fr: "{name} n'est pas un MP3 ou WAV pris en charge ({err}).",
  },
  'error.unsupportedHint': {
    en: 'Supported inputs: MP3 (with or without ID3/APE tags) and PCM/float WAV.',
    fr: 'Formats acceptés : MP3 (avec ou sans tags ID3/APE) et WAV PCM/flottant.',
  },

  'report.strippableMeta': {
    en: '{size} strippable metadata',
    fr: '{size} de métadonnées supprimables',
  },
  'report.largeWarning': {
    en: 'Large file ({size}). Spectral processing happens in memory and may be slow or hit browser limits.',
    fr: 'Fichier volumineux ({size}). Le traitement spectral se fait en mémoire et peut être lent ou atteindre les limites du navigateur.',
  },
  'report.mp3Hint': {
    en: 'Every mode except “Metadata only” shifts pitch to defeat acoustic recognition — this is audible (a slight key change) and re-encodes via ffmpeg.wasm (~30 MB, loaded once on first use), even for WAV. “Metadata only” is lossless but does not affect recognition.',
    fr: "Tous les modes sauf « Métadonnées seules » décalent la hauteur pour déjouer la reconnaissance acoustique — c'est audible (léger changement de tonalité) et réencode via ffmpeg.wasm (~30 Mo, chargé une fois à la première utilisation), même pour le WAV. « Métadonnées seules » est sans perte mais n'affecte pas la reconnaissance.",
  },
  'report.detectedStructure': { en: 'Detected structure', fr: 'Structure détectée' },
  'report.colRegion': { en: 'Region', fr: 'Région' },
  'report.colKind': { en: 'Kind', fr: 'Type' },
  'report.colSize': { en: 'Size', fr: 'Taille' },

  'section.process': { en: 'Process', fr: 'Traiter' },
  'section.mode': { en: 'Mode', fr: 'Mode' },
  'btn.process': { en: 'Process & download', fr: 'Traiter et télécharger' },
  'btn.analyze': { en: 'Analyze for watermarks', fr: 'Analyser les filigranes' },
  'btn.cancel': { en: 'Cancel', fr: 'Annuler' },
  'progress.aria': { en: 'Processing progress', fr: 'Progression du traitement' },

  'status.processing': { en: 'Processing ({mode})…', fr: 'Traitement ({mode})…' },
  'status.analyzing': { en: 'Analyzing…', fr: 'Analyse…' },
  'status.done': { en: 'Done', fr: 'Terminé' },
  'status.doneWarn': { en: 'Done (with warnings)', fr: 'Terminé (avec avertissements)' },
  'status.result': { en: '{state} → {name} ({size}).', fr: '{state} → {name} ({size}).' },
  'status.analyzed': { en: 'Analyzed {n} channel(s).', fr: '{n} canal/canaux analysé(s).' },
  'status.cancelled': { en: 'Cancelled.', fr: 'Annulé.' },
  'status.failed': { en: 'Failed: {msg}', fr: 'Échec : {msg}' },

  'rep.mode': { en: 'Mode', fr: 'Mode' },
  'rep.output': { en: 'Output', fr: 'Sortie' },
  'rep.lossless': { en: 'Lossless', fr: 'Sans perte' },
  'rep.losslessYes': {
    en: 'yes (audio preserved bit-for-bit)',
    fr: 'oui (audio préservé bit à bit)',
  },
  'rep.no': { en: 'no', fr: 'non' },
  'rep.metaRemoved': { en: 'Metadata removed', fr: 'Métadonnées supprimées' },
  'rep.pitch': { en: 'Pitch shift', fr: 'Décalage de hauteur' },
  'rep.pitchVal': {
    en: '~{p}% (breaks acoustic fingerprints)',
    fr: '~{p}% (casse les empreintes acoustiques)',
  },
  'rep.tempo': { en: 'Tempo change', fr: 'Changement de tempo' },
  'rep.tempoVal': { en: '~{t}%', fr: '~{t}%' },
  'rep.spectral': { en: 'Spectral', fr: 'Spectral' },
  'rep.spectralVal': {
    en: 'intensity {i}, FFT {f}, {p} pass(es)',
    fr: 'intensité {i}, FFT {f}, {p} passe(s)',
  },
  'rep.watermarks': { en: 'Watermarks (input)', fr: 'Filigranes (entrée)' },
  'rep.echoCh': { en: 'ch{ch}: echo {ms}ms', fr: 'ca{ch} : écho {ms}ms' },
  'rep.noneCh': { en: 'ch{ch}: none', fr: 'ca{ch} : aucun' },
  'rep.verification': { en: 'Verification', fr: 'Vérification' },
  'rep.passed': { en: 'passed', fr: 'réussie' },
  'rep.failed': { en: 'FAILED', fr: 'ÉCHEC' },
  'rep.clean': { en: 'output is metadata-free', fr: 'sortie sans métadonnées' },
  'rep.residual': {
    en: '{n} bytes of metadata remain',
    fr: '{n} octets de métadonnées subsistent',
  },

  'an.channel': { en: 'Channel {ch}', fr: 'Canal {ch}' },
  'an.echoAt': { en: 'echo at {ms} ms (strength {s})', fr: 'écho à {ms} ms (force {s})' },
  'an.noEcho': { en: 'no echo', fr: 'aucun écho' },
  'an.flatness': { en: 'flatness {v}', fr: 'planéité {v}' },
  'an.statsAnomaly': {
    en: 'statistical anomaly (entropy {e}, kurtosis {k})',
    fr: 'anomalie statistique (entropie {e}, kurtosis {k})',
  },
  'an.statsNormal': { en: 'stats normal', fr: 'stats normales' },
  'an.hfPeaks': { en: '{n} HF peak(s) >15 kHz', fr: '{n} pic(s) HF >15 kHz' },
  'an.noHf': { en: 'no HF marks', fr: 'aucune marque HF' },

  'mode.metadata.label': {
    en: 'Metadata only (lossless)',
    fr: 'Métadonnées seules (sans perte)',
  },
  'mode.metadata.desc': {
    en: 'Strip tags only, keeping the audio bit-for-bit. Does NOT defeat acoustic recognition.',
    fr: "Supprime seulement les tags, en gardant l'audio bit à bit. Ne déjoue PAS la reconnaissance acoustique.",
  },
  'mode.turbo.label': { en: 'Turbo (gentle pitch)', fr: 'Turbo (hauteur légère)' },
  'mode.turbo.desc': {
    en: 'A ~3% pitch shift — mildest audible change, may not fool stronger matchers.',
    fr: 'Un décalage de hauteur de ~3 % — changement le plus léger, peut ne pas tromper les détecteurs robustes.',
  },
  'mode.standard.label': { en: 'Standard (pitch + surgery)', fr: 'Standard (hauteur + retouche)' },
  'mode.standard.desc': {
    en: 'A ~4.5% pitch shift plus sync-tone notches and high-frequency watermark attenuation.',
    fr: 'Un décalage de hauteur de ~4,5 % plus des coupures de tonalités de synchro et une atténuation des filigranes haute fréquence.',
  },
  'mode.paranoid.label': { en: 'Paranoid (maximum)', fr: 'Paranoïaque (maximum)' },
  'mode.paranoid.desc': {
    en: 'A ~7% pitch shift, a ~3% tempo change, band-limiting, notches and strong phase randomization.',
    fr: 'Un décalage de hauteur de ~7 %, un changement de tempo de ~3 %, une limitation de bande, des coupures et une forte randomisation de phase.',
  },
} satisfies Record<string, Entry>;

export type MessageKey = keyof typeof MESSAGES;

let currentLocale: Locale = 'en';

/** Pick a locale from the browser language: French → 'fr', everything else → 'en'. */
export function detectLocale(): Locale {
  const lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.toLowerCase()
      : 'en';
  return lang.startsWith('fr') ? 'fr' : 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Translate `key` for the current locale, interpolating {placeholder} params. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const entry = MESSAGES[key];
  let text = entry[currentLocale] ?? entry.en;
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in params ? String(params[name]) : `{${name}}`
    );
  }
  return text;
}
