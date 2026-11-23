import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameController, GameState } from '../game/controller';
import { Recognizer, speechRecognitionSupported } from '../speech/recognizer';
import type { AppSettings } from './settings';
import { Board, EMPTY_FEN } from './Board';
import { LEVELS } from '../engine/stockfish';

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

  const [showMoves, setShowMoves] = useState(false);
  const orientation = state.playerColor === 'w' ? 'white' : 'black';
  const level = LEVELS.find((l) => l.id === settings.level);
  const botName = `Opponent · ${level?.label.split(' — ')[0] ?? ''}`;

  return (
    <section className="game">
      <div className="board-col">
        <div className="player-bar">
          <span className="who">
            <span className={`piece-dot ${state.playerColor === 'w' ? 'b' : 'w'}`} />
            {botName}
          </span>
          <span className="meta">{state.thinking ? 'thinking…' : ''}</span>
        </div>

        <div className="board-frame">
          {peeking && !over && <div className="peek-banner">Divyachakshu · {secondsLeft}s</div>}
          <div className={`board-inner ${peeking ? '' : 'hidden-board'}`}>
            <Board
              id="main"
              fen={peeking ? state.fen : EMPTY_FEN}
              orientation={orientation}
              lastMove={peeking ? state.lastMove : null}
            />
            {!peeking && (
              <div className="fog-overlay">
                <div className="cartouche">
                  <div className="eye" aria-hidden>◉</div>
                  <p>The board lives in your mind</p>
                  <small>Use Divyachakshu to glimpse it</small>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="player-bar">
          <span className="who">
            <span className={`piece-dot ${state.playerColor}`} />
            You
          </span>
          <span className="meta">playing {state.playerColor === 'w' ? 'White' : 'Black'}</span>
        </div>

        <div className="stats">
          <div className="stat"><b>{Math.floor(state.moves.length / 2) + (state.moves.length % 2)}</b><span>moves</span></div>
          <div className="stat"><b>{state.peeks}</b><span>peeks</span></div>
          <div className="stat warn"><b>{state.illegal}</b><span>illegal tries</span></div>
        </div>
      </div>

      <div className="side side-top">
        <div className="card sanjaya" aria-live="polite">
          <h2 className="card-title">Sanjaya says</h2>
          <p className="sanjaya-line">{lastSanjaya?.text ?? '…'}</p>
        </div>

        {over ? (
          <div className="card result">
            <h2>{state.result}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {state.moves.length} half-moves · {state.peeks} peeks · {state.illegal} illegal tries
            </p>
            <div className="row">
              <button className="btn primary" onClick={onPlayAgain}>Play again</button>
              <button className="btn" onClick={() => controller.reset()}>Change settings</button>
              <button className="btn" onClick={() => navigator.clipboard?.writeText(state.pgn)}>Copy PGN</button>
            </div>
          </div>
        ) : (
          <div className="card controls">
            <button
              className={`mic ${listening ? 'on' : ''} ${controller.awaitingPlayer ? '' : 'idle'}`}
              disabled={!sttOk}
              onPointerDown={settings.handsFree ? undefined : pressStart}
              onPointerUp={settings.handsFree ? undefined : pressEnd}
              onPointerLeave={settings.handsFree || !listening ? undefined : pressEnd}
              aria-label={settings.handsFree ? 'Listening automatically' : 'Hold to talk'}
            >
              <MicIcon />
              <span>{settings.handsFree ? 'Hands-free' : 'Hold to talk'}</span>
            </button>
            <div className="status">{status}</div>
            {interim && <div className="interim">“{interim}”</div>}
            {micError && <div className="notice">{micError}</div>}
            {sttOk && (
              <div className="mode-row">
                {settings.handsFree ? <span>Listening automatically on your turn.</span> : <span>Or hold the space bar.</span>}
                <button className="link" onClick={() => onSettings({ ...settings, handsFree: !settings.handsFree })}>
                  {settings.handsFree ? 'Use hold-to-talk' : 'Go hands-free'}
                </button>
              </div>
            )}

            <form className="typed" onSubmit={submitTyped}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type a move: Nf3, why, repeat…"
                aria-label="Type a move or command"
              />
              <button className="btn" type="submit">Send</button>
            </form>

            <div className="actions">
              <button className="btn gold" onClick={() => controller.peek()} title="Briefly reveal the board">
                ◉ Divyachakshu — glimpse the board
              </button>
              <button className="btn" onClick={() => controller.repeat()}>Repeat</button>
              <button className="btn" onClick={() => controller.why()}>Why?</button>
              <button className="btn" onClick={() => controller.handleInput(['help'])}>Help</button>
              <button className="btn danger" onClick={() => controller.resign()}>Resign</button>
            </div>
          </div>
        )}
      </div>

      <div className="side side-bottom">
        <div className="card">
          <div className="toggle-row">
            <h2 className="card-title" style={{ margin: 0, flex: 1 }}>Moves</h2>
            {!over && <button className="link" onClick={() => setShowMoves((v) => !v)}>{showMoves ? 'Hide' : 'Show'}</button>}
          </div>
          {showMoves || over ? (
            <div className="movelist" style={{ marginTop: 10 }}>
              {pairs(state.moves).map(([w, b], i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <span className={`num ${i % 2 ? 'row-alt' : ''}`}>{i + 1}.</span>
                  <span className={i % 2 ? 'row-alt' : ''}>{w}</span>
                  <span className={i % 2 ? 'row-alt' : ''}>{b ?? ''}</span>
                </div>
              ))}
              {state.moves.length === 0 && <span className="muted" style={{ gridColumn: '1 / -1' }}>No moves yet.</span>}
            </div>
          ) : (
            <p className="muted small" style={{ margin: '8px 0 0' }}>Hidden, to keep it blindfold. Try to recall the moves yourself.</p>
          )}
        </div>

        <details className="card log">
          <summary className="card-title" style={{ margin: 0 }}>Conversation ({state.log.length})</summary>
          <ol>
            {state.log.map((l, i) => (
              <li key={i} className={l.who}>
                <b>{l.who === 'you' ? 'You' : 'Sanjaya'}:</b> {l.text}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

function pairs(moves: string[]): [string, string | undefined][] {
  const out: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) out.push([moves[i], moves[i + 1]]);
  return out;
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
