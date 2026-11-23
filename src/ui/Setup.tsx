import { useEffect, useState } from 'react';
import { LEVELS } from '../engine/stockfish';
import { listVoices, defaultVoice } from '../speech/sanjaya';
import { speechRecognitionSupported } from '../speech/recognizer';
import type { AppSettings } from './settings';

interface Props {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onStart: () => void;
}

export function Setup({ settings, onChange, onStart }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const update = () => setVoices(listVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => onChange({ ...settings, [k]: v });
  const voiceURI = settings.voiceURI ?? defaultVoice(voices)?.voiceURI ?? '';
  const sttOk = speechRecognitionSupported();

  return (
    <section className="setup">
      <div className="hero">
        <p className="verse">Manokshetre Chaturange…</p>
        <h1>Play chess with your eyes closed.</h1>
        <p className="lede">
          Speak your moves. Sanjaya narrates the battle you cannot see, and tells you when — and why — you lose track of the board.
        </p>
      </div>

      {!sttOk && (
        <div className="notice">
          This browser has no speech recognition. You can still type moves, or open Manokshetra in Chrome or Edge to play by voice.
        </div>
      )}

      <div className="card form">
        <Field label="Your army">
          <Segmented
            value={settings.color}
            options={[['w', 'White'], ['b', 'Black'], ['random', 'Random']]}
            onChange={(v) => set('color', v as AppSettings['color'])}
          />
        </Field>

        <Field label="Opponent strength" hint={LEVELS.find((l) => l.id === settings.level)?.label}>
          <input type="range" min={1} max={LEVELS.length} value={settings.level} onChange={(e) => set('level', Number(e.target.value))} />
        </Field>

        <Field label="Talking">
          <Segmented
            value={settings.handsFree ? 'free' : 'ptt'}
            options={[['ptt', 'Hold to talk'], ['free', 'Hands-free']]}
            onChange={(v) => set('handsFree', v === 'free')}
          />
        </Field>

        <Field label="Sanjaya's voice">
          <select value={voiceURI} onChange={(e) => set('voiceURI', e.target.value)}>
            {voices.length === 0 && <option value="">Default voice</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </Field>

        <Field label="Speaking speed" hint={`${settings.rate.toFixed(1)}×`}>
          <input type="range" min={0.6} max={1.6} step={0.1} value={settings.rate} onChange={(e) => set('rate', Number(e.target.value))} />
        </Field>

        <Field label="Divyachakshu (peek) length" hint={`${settings.peekSeconds}s`}>
          <input type="range" min={2} max={15} value={settings.peekSeconds} onChange={(e) => set('peekSeconds', Number(e.target.value))} />
        </Field>

        <label className="check">
          <input type="checkbox" checked={settings.confirmMoves} onChange={(e) => set('confirmMoves', e.target.checked)} />
          <span>Confirm each move before playing it</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.autoExplain} onChange={(e) => set('autoExplain', e.target.checked)} />
          <span>Explain illegal moves right away (otherwise say “why”)</span>
        </label>

        <button className="btn primary big" onClick={onStart}>Begin the battle</button>
      </div>

      <div className="card tips">
        <h2>How to speak</h2>
        <ul>
          <li><b>Moves:</b> “e4”, “knight f3”, “bishop takes c6”, “castle kingside”, “e8 queen”</li>
          <li><b>Unclear letters?</b> Use NATO words: “bravo five”, “delta four”</li>
          <li><b>Two pieces can go there?</b> “knight b d2” or “knight from b1 to d2”</li>
          <li><b>Commands:</b> “repeat”, “why”, “peek”, “help”, “resign”</li>
        </ul>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
