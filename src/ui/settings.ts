import type { GameSettings } from '../game/controller';

export interface AppSettings extends GameSettings {
  handsFree: boolean;
  soundCues: boolean;
  voiceURI?: string;
  rate: number;
  lang: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  color: 'w',
  level: 2,
  confirmMoves: false,
  autoExplain: false,
  peekSeconds: 5,
  handsFree: false,
  soundCues: true,
  rate: 1,
  lang: 'en-US',
};

const KEY = 'manokshetra.settings.v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}
