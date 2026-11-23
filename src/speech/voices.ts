/**
 * Picks a short list of clear, natural-sounding voices out of everything the
 * browser offers (macOS alone ships dozens, many of them novelty or robotic).
 */

export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
  default?: boolean;
}

export interface CuratedVoice<V extends VoiceLike = VoiceLike> {
  voice: V;
  label: string;
  score: number;
}

/** Novelty and old formant voices that sound robotic. */
const BLOCKED = new RegExp(
  '\\b(' +
    [
      'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical',
      'jester', 'junior', 'organ', 'pipe organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'ralph',
      'fred', 'kathy', 'princess', 'grandma', 'grandpa', 'eddy', 'flo', 'reed', 'rocko', 'sandy', 'shelley',
      'agnes', 'vicki', 'victoria', 'bruce', 'novelty', 'espeak',
    ].join('|') +
    ')\\b',
  'i',
);

/** Known good voices by platform, with a base score. */
const KNOWN: [RegExp, number][] = [
  // Edge / Windows neural voices — the most natural in any browser.
  [/microsoft .*online \(natural\)/i, 100],
  // Apple premium / enhanced downloads.
  [/\((premium|enhanced)\)/i, 90],
  // Chrome's Google voices.
  [/^google (uk english (male|female)|us english)$/i, 80],
  // Good built-in Apple voices.
  [/^(daniel|samantha|karen|moira|rishi|veena|tessa|serena|kate|oliver|arthur|martha|ava|evan|zoe|allison|tom|susan|nathan|joelle|noelle|alex)\b/i, 70],
  // Android Chrome uses locale names.
  [/^english \(/i, 60],
];

const ACCENTS: Record<string, string> = {
  'en-in': 'Indian English',
  'en-gb': 'British English',
  'en-us': 'American English',
  'en-au': 'Australian English',
  'en-ie': 'Irish English',
  'en-ca': 'Canadian English',
  'en-za': 'South African English',
  'en-nz': 'New Zealand English',
};

export function voiceScore(v: VoiceLike): number {
  const lang = v.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('en')) return -1;
  if (BLOCKED.test(v.name)) return -1;
  const known = KNOWN.find(([re]) => re.test(v.name));
  if (!known) return -1;
  let score = known[1];
  // Sanjaya's natural accent, then British.
  if (lang === 'en-in') score += 8;
  else if (lang === 'en-gb') score += 4;
  return score;
}

/** "Microsoft Prabhat Online (Natural) - English (India)" -> "Prabhat". */
export function friendlyName(v: VoiceLike): string {
  let n = v.name;
  n = n.replace(/^microsoft\s+/i, '').replace(/\s+online.*$/i, '');
  n = n.replace(/^google\s+/i, 'Google ').replace(/\s*\((premium|enhanced)\)/i, ' ✦');
  n = n.replace(/\s+-\s+english.*$/i, '');
  return n.trim();
}

export function voiceLabel(v: VoiceLike): string {
  const accent = ACCENTS[v.lang.toLowerCase().replace('_', '-')] ?? 'English';
  return `${friendlyName(v)} · ${accent}`;
}

/** Best voices first, at most `max`. Falls back to a few plain English voices if nothing is known. */
export function curateVoices<V extends VoiceLike>(all: V[], max = 6): CuratedVoice<V>[] {
  const seen = new Set<string>();
  const scored = all
    .map((voice) => ({ voice, label: voiceLabel(voice), score: voiceScore(voice) }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
  if (scored.length) return scored.slice(0, max);

  return all
    .filter((v) => v.lang.toLowerCase().startsWith('en') && !BLOCKED.test(v.name))
    .slice(0, 3)
    .map((voice) => ({ voice, label: voiceLabel(voice), score: 0 }));
}
