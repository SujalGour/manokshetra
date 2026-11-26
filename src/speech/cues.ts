/*
 * Soft sound cues so the player knows, with eyes closed, when the mic opens and closes.
 * Generated with Web Audio (no files to load).
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a click/tap so browsers allow audio later (e.g. hands-free listening). */
export function unlockCues() {
  audio();
}

function tone(c: AudioContext, freq: number, start: number, duration: number, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  // Quick attack and smooth decay so it sounds like a soft "tick", not a beep.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export type Cue = 'listen-start' | 'listen-stop';

export function playCue(cue: Cue, volume = 0.12) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (cue === 'listen-start') {
    // Two rising notes: "I'm listening".
    tone(c, 784, t, 0.09, volume);
    tone(c, 1046, t + 0.08, 0.12, volume);
  } else {
    // Two falling notes: "got it, mic closed".
    tone(c, 880, t, 0.09, volume * 0.9);
    tone(c, 587, t + 0.08, 0.14, volume * 0.9);
  }
}
