/* Sanjaya, the narrator: text-to-speech with a promise that resolves when speaking ends. */

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
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

/** Prefers a voice with an Indian English accent for Sanjaya, then any English voice. */
export function defaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => /google uk english male|daniel/i.test(v.name)) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export class Sanjaya implements Speaker {
  constructor(private settings: () => VoiceSettings) {}

  speak(text: string): Promise<void> {
    const s = this.settings();
    if (s.muted || typeof speechSynthesis === 'undefined' || !text) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voices = listVoices();
      u.voice = voices.find((v) => v.voiceURI === s.voiceURI) ?? defaultVoice(voices) ?? null;
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
