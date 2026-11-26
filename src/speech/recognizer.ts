/* Thin wrapper over the browser's speech recognition (Chrome/Edge/Safari). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

export interface RecognizerEvents {
  /** Final result: alternatives, best first. */
  onResult: (alternatives: string[]) => void;
  /** Live partial transcript while the player is talking. */
  onInterim?: (text: string) => void;
  /** `info` is given when listening ends: whether anything was heard, and whether it was aborted. */
  onListening?: (listening: boolean, info?: { heard: boolean; aborted: boolean }) => void;
  onError?: (message: string) => void;
}

export function speechRecognitionSupported(): boolean {
  const w = window as AnyRecognition;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class Recognizer {
  private rec: AnyRecognition | null = null;
  private listening = false;
  private gotResult = false;
  private aborted = false;

  constructor(private events: RecognizerEvents, private lang = 'en-US') {}

  get isListening() {
    return this.listening;
  }

  start() {
    if (this.listening) return;
    const w = window as AnyRecognition;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      this.events.onError?.('Speech recognition is not supported in this browser. Try Chrome, or type your moves.');
      return;
    }
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    this.gotResult = false;
    this.aborted = false;

    rec.onresult = (e: AnyRecognition) => {
      const res = e.results[e.results.length - 1];
      if (!res) return;
      if (res.isFinal) {
        const alts: string[] = [];
        for (let i = 0; i < res.length; i++) alts.push(String(res[i].transcript).trim());
        this.gotResult = true;
        this.events.onResult(alts.filter(Boolean));
      } else {
        this.events.onInterim?.(String(res[0].transcript));
      }
    };
    rec.onerror = (e: AnyRecognition) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const msg =
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow the microphone for this site, or type your moves.'
          : `Speech recognition error: ${e.error}`;
      this.events.onError?.(msg);
    };
    rec.onend = () => {
      this.listening = false;
      this.rec = null;
      this.events.onListening?.(false, { heard: this.gotResult, aborted: this.aborted });
    };
    try {
      rec.start();
      this.rec = rec;
      this.listening = true;
      this.events.onListening?.(true);
    } catch (err) {
      this.events.onError?.(String(err));
    }
  }

  /** Stop and deliver whatever was heard (push-to-talk release). */
  stop() {
    this.rec?.stop();
  }

  /** Stop and discard (e.g. Sanjaya is about to speak). */
  abort() {
    if (this.rec) this.aborted = true;
    this.rec?.abort();
  }

  get heardSomething() {
    return this.gotResult;
  }
}
