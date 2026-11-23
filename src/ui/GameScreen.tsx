import { useCallback, useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { GameController, GameState } from '../game/controller';
import { Recognizer, speechRecognitionSupported } from '../speech/recognizer';
import type { AppSettings } from './settings';

interface Props {
  controller: GameController;
  state: GameState;
  settings: AppSettings;
  onSettings: (s: AppSettings) => void;
  onPlayAgain: () => void;
}

export function GameScreen({ controller, state, settings, onSettings, onPlayAgain }: Props) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [now, setNow] = useState(Date.now());
  const recRef = useRef<Recognizer | null>(null);
  const sttOk = speechRecognitionSupported();

  if (!recRef.current) {
    recRef.current = new Recognizer(
      {
        onResult: (alts) => {
          setInterim('');
          void controller.handleInput(alts);
        },
        onInterim: setInterim,
        onListening: setListening,
        onError: (m) => {
          setMicError(m);
          setListening(false);
        },
      },
      settings.lang,
    );
  }
  const rec = recRef.current;

  // Never listen while Sanjaya speaks (the mic would hear him).
  useEffect(() => {
    if (state.speaking || state.thinking || state.phase !== 'playing') rec.abort();
  }, [state.speaking, state.thinking, state.phase, rec]);

  // Hands-free: start listening whenever it's the player's turn.
  useEffect(() => {
    if (!settings.handsFree || micError || !sttOk) return;
    if (listening || !controller.awaitingPlayer) return;
    const t = setTimeout(() => controller.awaitingPlayer && rec.start(), 300);
    return () => clearTimeout(t);
  }, [settings.handsFree, micError, sttOk, listening, state, controller, rec]);

  useEffect(() => () => rec.abort(), [rec]);

  // Peek countdown.
  const peeking = state.peekUntil > now || state.phase === 'over';
  useEffect(() => {
    if (state.peekUntil <= Date.now()) return;
    const i = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(i);
  }, [state.peekUntil]);

  const pressStart = useCallback(() => {
    if (settings.handsFree || !controller.awaitingPlayer) return;
    setMicError(null);
    rec.start();
  }, [settings.handsFree, controller, rec]);
  const pressEnd = useCallback(() => {
    if (!settings.handsFree) rec.stop();
  }, [settings.handsFree, rec]);

  // Space bar = push to talk (when not typing).
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e)) return;
      e.preventDefault();
      pressStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e)) return;
      e.preventDefault();
      pressEnd();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pressStart, pressEnd]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    void controller.handleInput([typed]);
    setTyped('');
  };

  const lastSanjaya = [...state.log].reverse().find((l) => l.who === 'sanjaya');
  const status = statusText(state, listening, controller.awaitingPlayer);
  const over = state.phase === 'over';
  const secondsLeft = Math.max(0, Math.ceil((state.peekUntil - now) / 1000));

  return (
    <section className="game">
      <div className="game-meta">
        <span className={`chip ${state.playerColor === 'w' ? 'white' : 'black'}`}>
          You: {state.playerColor === 'w' ? 'White' : 'Black'}
        </span>
        <span className="chip">Move {Math.floor(state.moves.length / 2) + 1}</span>
        <span className="chip">Divyachakshu used: {state.peeks}</span>
        <span className="chip warn">Illegal tries: {state.illegal}</span>
      </div>

      <div className="sanjaya card" aria-live="polite">
        <div className="sanjaya-label">Sanjaya</div>
        <p className="sanjaya-line">{lastSanjaya?.text ?? '…'}</p>
      </div>

      {over ? (
        <div className="card result">
          <h2>{state.result}</h2>
          <p className="muted">
            {state.moves.length} half-moves · {state.peeks} peeks · {state.illegal} illegal tries
          </p>
          <div className="row">
            <button className="btn primary" onClick={onPlayAgain}>Play again</button>
            <button className="btn" onClick={() => controller.reset()}>Change settings</button>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(state.pgn)}>Copy PGN</button>
          </div>
        </div>
      ) : (
        <div className="controls">
          <button
            className={`mic ${listening ? 'on' : ''} ${controller.awaitingPlayer ? '' : 'idle'}`}
            disabled={!sttOk}
            onPointerDown={settings.handsFree ? undefined : pressStart}
            onPointerUp={settings.handsFree ? undefined : pressEnd}
            onPointerLeave={settings.handsFree || !listening ? undefined : pressEnd}
            onClick={settings.handsFree ? () => onSettings({ ...settings, handsFree: false }) : undefined}
            aria-label={settings.handsFree ? 'Hands-free listening. Click to switch to hold-to-talk.' : 'Hold to talk'}
          >
            <MicIcon />
            <span>{settings.handsFree ? 'Hands-free' : 'Hold to talk'}</span>
          </button>
          <div className="status">{status}</div>
          {interim && <div className="interim">“{interim}”</div>}
          {micError && <div className="notice">{micError}</div>}
          {!settings.handsFree && sttOk && <div className="muted small">Tip: hold the space bar to talk.</div>}
          {settings.handsFree === false && sttOk && (
            <button className="link" onClick={() => onSettings({ ...settings, handsFree: true })}>Switch to hands-free</button>
          )}

          <form className="typed" onSubmit={submitTyped}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type a move or command (e.g. Nf3, why, repeat)"
              aria-label="Type a move or command"
            />
            <button className="btn" type="submit">Send</button>
          </form>

          <div className="actions">
            <button className="btn gold" onClick={() => controller.peek()} title="Briefly reveal the board">
              Divyachakshu · peek
            </button>
            <button className="btn" onClick={() => controller.repeat()}>Repeat</button>
            <button className="btn" onClick={() => controller.why()}>Why?</button>
            <button className="btn danger" onClick={() => controller.resign()}>Resign</button>
          </div>
        </div>
      )}

      <div className={`board-wrap ${peeking ? 'revealed' : ''}`}>
        {peeking ? (
          <>
            {!over && <div className="peek-timer">Divine sight fades in {secondsLeft}s</div>}
            <Chessboard
              id="peek"
              position={state.fen}
              boardOrientation={state.playerColor === 'w' ? 'white' : 'black'}
              arePiecesDraggable={false}
              customDarkSquareStyle={{ backgroundColor: '#7a5c3e' }}
              customLightSquareStyle={{ backgroundColor: '#e8d5b5' }}
            />
          </>
        ) : (
          <div className="fog">
            <div className="fog-eye" aria-hidden>◉</div>
            <p>The board lives in your mind.</p>
          </div>
        )}
      </div>

      <details className="card log">
        <summary>Conversation ({state.log.length})</summary>
        <ol>
          {state.log.map((l, i) => (
            <li key={i} className={l.who}>
              <b>{l.who === 'you' ? 'You' : 'Sanjaya'}:</b> {l.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function statusText(s: GameState, listening: boolean, awaiting: boolean): string {
  if (s.phase === 'over') return '';
  if (listening) return 'Listening…';
  if (s.speaking) return 'Sanjaya is speaking…';
  if (s.thinking) return 'Your opponent is thinking…';
  if (s.pending?.kind === 'confirm') return 'Say “yes” or “no”.';
  if (s.pending?.kind === 'clarify') return 'Say which one.';
  if (awaiting) return 'Your move.';
  return '';
}

function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
