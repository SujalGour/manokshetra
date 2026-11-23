import { describe, expect, it } from 'vitest';
import { curateVoices, friendlyName } from '../src/speech/voices';

const v = (name: string, lang: string) => ({ name, lang, voiceURI: name });

const MAC_CHROME = [
  v('Albert', 'en-US'), v('Bad News', 'en-US'), v('Bubbles', 'en-US'), v('Zarvox', 'en-US'), v('Fred', 'en-US'),
  v('Daniel', 'en-GB'), v('Samantha', 'en-US'), v('Karen', 'en-AU'), v('Rishi', 'en-IN'), v('Moira', 'en-IE'),
  v('Eddy (English (US))', 'en-US'), v('Grandma (English (UK))', 'en-GB'), v('Thomas', 'fr-FR'),
  v('Google US English', 'en-US'), v('Google UK English Male', 'en-GB'), v('Google UK English Female', 'en-GB'),
  v('Ava (Premium)', 'en-US'),
];

describe('curateVoices', () => {
  it('drops novelty voices and keeps a short, ranked list', () => {
    const names = curateVoices(MAC_CHROME).map((c) => c.voice.name);
    expect(names.length).toBeLessThanOrEqual(6);
    expect(names[0]).toBe('Ava (Premium)');
    for (const bad of ['Albert', 'Bad News', 'Bubbles', 'Zarvox', 'Fred', 'Eddy (English (US))', 'Grandma (English (UK))', 'Thomas']) {
      expect(names).not.toContain(bad);
    }
    expect(names).toContain('Google UK English Male');
  });

  it('puts Edge natural voices first, Indian English on top', () => {
    const edge = [
      v('Microsoft David - English (United States)', 'en-US'),
      v('Microsoft Guy Online (Natural) - English (United States)', 'en-US'),
      v('Microsoft Prabhat Online (Natural) - English (India)', 'en-IN'),
    ];
    const list = curateVoices(edge);
    expect(list.map((c) => c.label)).toEqual(['Prabhat · Indian English', 'Guy · American English']);
  });

  it('falls back to plain English voices when none are known', () => {
    const list = curateVoices([v('Some Voice', 'en-US'), v('Bubbles', 'en-US'), v('Otra', 'es-ES')]);
    expect(list.map((c) => c.voice.name)).toEqual(['Some Voice']);
  });

  it('makes friendly names', () => {
    expect(friendlyName(v('Microsoft Neerja Online (Natural) - English (India)', 'en-IN'))).toBe('Neerja');
    expect(friendlyName(v('Ava (Premium)', 'en-US'))).toBe('Ava ✦');
  });
});
