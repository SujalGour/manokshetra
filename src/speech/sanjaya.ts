/* Sanjaya, the narrator: text-to-speech with a promise that resolves when speaking ends. */
import { curateVoices } from './voices';

export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
}

export interface VoiceSettings {
  voiceURI?: string;
  rate: number;
  muted?: boolean;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices();
}

/** The short list shown in settings. */
export function sanjayaVoices() {
  return curateVoices(listVoices());
}

/** Best curated voice: Indian English if available, otherwise the clearest one. */
export function defaultVoice(): SpeechSynthesisVoice | undefined {
  return sanjayaVoices()[0]?.voice;
}

/** Resolves a saved voice, ignoring saved voices that are no longer on the list. */
export function resolveVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const list = sanjayaVoices();
  return list.find((c) => c.voice.voiceURI === voiceURI)?.voice ?? list[0]?.voice;
}

export class Sanjaya implements Speaker {
  constructor(private settings: () => VoiceSettings) {}

  speak(text: string): Promise<void> {
    const s = this.settings();
    if (s.muted || typeof speechSynthesis === 'undefined' || !text) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = resolveVoice(s.voiceURI);
      u.voice = voice ?? null;
      if (voice) u.lang = voice.lang;
      u.rate = s.rate;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      // Some browsers never fire onend; don't hang the game.
      const timer = setTimeout(finish, 2500 + (text.length * 90) / s.rate);
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
}
