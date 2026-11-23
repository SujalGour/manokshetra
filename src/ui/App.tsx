import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameController } from '../game/controller';
import { createEngine } from '../engine/stockfish';
import { Sanjaya } from '../speech/sanjaya';
import { loadSettings, saveSettings, type AppSettings } from './settings';
import { Setup } from './Setup';
import { GameScreen } from './GameScreen';

export function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const controller = useMemo(() => {
    const voice = new Sanjaya(() => ({ voiceURI: settingsRef.current.voiceURI, rate: settingsRef.current.rate }));
    return new GameController(createEngine(), voice);
  }, []);

  const state = useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.state,
  );

  useEffect(() => saveSettings(settings), [settings]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => state.phase !== 'playing' && controller.reset()} aria-label="Manokshetra home">
          <span className="brand-mark" aria-hidden>♞</span>
          <span>
            <div className="brand-name">Manokshetra</div>
            <div className="brand-sub">मनोक्षेत्र <span>· the battlefield of the mind</span></div>
          </span>
        </button>
        {state.phase !== 'setup' && (
          <button className="btn ghost" onClick={() => controller.reset()}>New game</button>
        )}
      </header>
      <main>
        {state.phase === 'setup' ? (
          <Setup
            settings={settings}
            onChange={setSettings}
            onStart={() => controller.start(settings)}
          />
        ) : (
          <GameScreen
            controller={controller}
            state={state}
            settings={settings}
            onSettings={setSettings}
            onPlayAgain={() => controller.start(settings)}
          />
        )}
      </main>
      <footer className="foot">“Sanjaya uvācha” — narrated by Sanjaya · engine: Stockfish</footer>
    </div>
  );
}
