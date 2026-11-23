import { Chess, type Color, type Move } from 'chess.js';
import { explainIllegal } from '../coach/illegalExplainer';
import { parseCommand } from '../parser/commandParser';
import { parseMoveAlternatives, type MoveIntent } from '../parser/moveParser';
import type { MoveSource } from '../engine/stockfish';
import type { Speaker } from '../speech/sanjaya';
import { COLOR_NAMES, describeMove, describeMoveShort, join, type Line } from '../speech/phrasing';

export interface GameSettings {
  color: Color | 'random';
  level: number;
  confirmMoves: boolean;
  autoExplain: boolean;
  peekSeconds: number;
}

export interface LogEntry {
  who: 'sanjaya' | 'you';
  text: string;
}

export type Pending =
  | { kind: 'confirm'; move: Move }
  | { kind: 'clarify'; candidates: Move[] };

export interface GameState {
  phase: 'setup' | 'playing' | 'over';
  fen: string;
  playerColor: Color;
  speaking: boolean;
  thinking: boolean;
  pending: Pending | null;
  log: LogEntry[];
  moves: string[];
  lastMove: { from: string; to: string } | null;
  lastBotLine: Line | null;
  peeks: number;
  illegal: number;
  peekUntil: number;
  result: string | null;
  pgn: string;
}

const HELP: Line = {
  text: 'Say a move like "knight f3", "e4" or "castle kingside". You can also say: repeat, why, peek, or resign.',
  speech: 'Say a move like knight F 3, E 4, or castle kingside. You can also say: repeat, why, peek, or resign.',
};

const plain = (s: string): Line => ({ text: s, speech: s });

export class GameController {
  private chess = new Chess();
  private listeners = new Set<(s: GameState) => void>();
  private lastIllegal: MoveIntent | null = null;
  private settings: GameSettings = { color: 'w', level: 3, confirmMoves: false, autoExplain: false, peekSeconds: 5 };
  private gameId = 0;
  state: GameState = this.initialState();

  constructor(private engine: MoveSource & { newGame?: () => void }, private speaker: Speaker) {}

  private initialState(): GameState {
    return {
      phase: 'setup', fen: new Chess().fen(), playerColor: 'w', speaking: false, thinking: false,
      pending: null, log: [], moves: [], lastMove: null, lastBotLine: null, peeks: 0, illegal: 0, peekUntil: 0, result: null, pgn: '',
    };
  }

  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<GameState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private syncBoard() {
    const last = this.chess.history({ verbose: true }).at(-1);
    this.set({
      fen: this.chess.fen(),
      moves: this.chess.history(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      pgn: this.chess.pgn(),
    });
  }

  /** True when it's the player's turn and nothing else is happening. */
  get awaitingPlayer(): boolean {
    const s = this.state;
    return s.phase === 'playing' && !s.speaking && !s.thinking && this.chess.turn() === s.playerColor;
  }

  private async say(line: Line) {
    const id = this.gameId;
    this.set({ speaking: true, log: [...this.state.log, { who: 'sanjaya', text: line.text }] });
    await this.speaker.speak(line.speech);
    if (id === this.gameId) this.set({ speaking: false });
  }

  async start(settings: GameSettings) {
    this.speaker.cancel();
    this.gameId++;
    this.settings = settings;
    const color: Color = settings.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color;
    this.chess = new Chess();
    this.chess.setHeader('Event', 'Manokshetra blindfold game');
    this.chess.setHeader('White', color === 'w' ? 'You' : `Bot level ${settings.level}`);
    this.chess.setHeader('Black', color === 'b' ? 'You' : `Bot level ${settings.level}`);
    this.lastIllegal = null;
    this.engine.newGame?.();
    this.set({ ...this.initialState(), phase: 'playing', playerColor: color });
    this.syncBoard();
    const intro = color === 'w'
      ? 'Sanjaya here. The battle on the field of the mind begins. You command the white army. Make your move.'
      : 'Sanjaya here. The battle on the field of the mind begins. You command the black army. White moves first.';
    await this.say(plain(intro));
    if (color === 'b') await this.botMove();
  }

  reset() {
    this.speaker.cancel();
    this.gameId++;
    this.set(this.initialState());
  }

  /** Voice or keyboard input. `alternatives` are best-first transcripts. */
  async handleInput(alternatives: string[]) {
    const alts = alternatives.map((a) => a.trim()).filter(Boolean);
    if (!alts.length || this.state.phase !== 'playing' || this.state.speaking || this.state.thinking) return;
    this.set({ log: [...this.state.log, { who: 'you', text: alts[0] }] });

    const pending = this.state.pending;
    const cmd = parseCommand(alts[0]);

    if (pending?.kind === 'confirm') {
      if (cmd === 'yes') return this.commit(pending.move, true);
      if (cmd === 'no') {
        this.set({ pending: null });
        return this.say(plain('Alright. Say your move again.'));
      }
    }
    if (pending?.kind === 'clarify') {
      if (cmd === 'yes' && pending.candidates.length === 1) return this.commit(pending.candidates[0], true);
      if (cmd === 'no') {
        this.set({ pending: null });
        return this.say(plain('Alright. Say your move again.'));
      }
      const pick = pickCandidate(pending.candidates, alts);
      if (pick) return this.commit(pick, true);
    }

    if (cmd && cmd !== 'yes' && cmd !== 'no') return this.runCommand(cmd);

    if (this.chess.turn() !== this.state.playerColor) return;
    const r = parseMoveAlternatives(this.chess, alts);
    switch (r.kind) {
      case 'move':
        if (this.settings.confirmMoves) {
          this.set({ pending: { kind: 'confirm', move: r.move } });
          return this.say(join(describeMoveShort(r.move), '?'));
        }
        return this.commit(r.move, false);
      case 'ambiguous': {
        this.set({ pending: { kind: 'clarify', candidates: r.candidates } });
        if (r.candidates.length === 1) return this.say(join('Did you mean', describeMoveShort(r.candidates[0]), '?'));
        const options = r.candidates.slice(0, 4).map((m) => describeMoveShort(m));
        const list = options.reduce<Line>((acc, o, i) => (i === 0 ? o : join(acc, i === options.length - 1 ? ', or' : ',', o)), plain(''));
        return this.say(join('Which one?', list, '?'));
      }
      case 'illegal': {
        this.lastIllegal = r.intent;
        const n = this.state.illegal + 1;
        this.set({ illegal: n, pending: null });
        if (this.settings.autoExplain) return this.say(join('Illegal move.', explainIllegal(this.chess, r.intent)));
        return this.say(plain(n === 1 ? 'That move is not legal. Say "why" if you want to know the reason.' : pickPhrase(ILLEGAL_PHRASES)));
      }
      case 'none':
        return this.say(plain(`I didn't catch a move. I heard: "${alts[0]}". Say "help" for examples.`));
    }
  }

  private async runCommand(cmd: string) {
    switch (cmd) {
      case 'repeat':
        return this.repeat();
      case 'why':
        return this.why();
      case 'peek':
        this.peek();
        return;
      case 'resign':
        return this.resign();
      case 'help':
        return this.say(HELP);
    }
  }

  async repeat() {
    if (this.state.speaking) return;
    const last = this.state.lastBotLine;
    await this.say(last ? join('My last move:', last) : plain('No moves from my side yet.'));
  }

  async why() {
    if (this.state.speaking) return;
    if (!this.lastIllegal) return this.say(plain('Your last attempt was not illegal. Nothing to explain.'));
    await this.say(explainIllegal(this.chess, this.lastIllegal));
  }

  /** Divyachakshu: a brief moment of divine sight. */
  peek() {
    if (this.state.phase !== 'playing') return;
    this.set({ peeks: this.state.peeks + 1, peekUntil: Date.now() + this.settings.peekSeconds * 1000 });
  }

  async resign() {
    if (this.state.phase !== 'playing') return;
    this.gameId++;
    this.speaker.cancel();
    this.finish('You resigned. The battle is over.');
    await this.say(plain('You resigned. The battle is over. Well fought.'));
  }

  private async commit(move: Move, alreadyConfirmed: boolean) {
    const id = this.gameId;
    this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    this.lastIllegal = null;
    this.set({ pending: null });
    this.syncBoard();
    // Echo the move so misheard moves get noticed, while the engine thinks.
    const echo = alreadyConfirmed ? null : this.say(describeMove(move));
    if (this.checkGameOver()) {
      await echo;
      if (id === this.gameId) await this.say(plain(this.state.result!));
      return;
    }
    await Promise.all([echo, this.botMove(id)]);
  }

  private async botMove(id = this.gameId) {
    this.set({ thinking: true });
    let uci: string;
    try {
      uci = await this.engine.bestMove(this.chess.fen(), this.settings.level);
    } finally {
      if (id === this.gameId) this.set({ thinking: false });
    }
    if (id !== this.gameId) return;
    // Let the echo of the player's move finish first.
    while (this.state.speaking) await new Promise((r) => setTimeout(r, 50));
    if (id !== this.gameId) return;
    const move = this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    const line = describeMove(move);
    const side = COLOR_NAMES[move.color];
    this.set({ lastBotLine: line });
    this.syncBoard();
    const over = this.checkGameOver();
    await this.say(join(`${capitalize(side)}:`, line, over ? this.state.result! : ''));
  }

  private checkGameOver(): boolean {
    const c = this.chess;
    if (!c.isGameOver()) return false;
    let result: string;
    if (c.isCheckmate()) {
      const winner = c.turn() === 'w' ? 'b' : 'w';
      result = winner === this.state.playerColor ? 'Checkmate! You win the battle.' : `Checkmate. ${capitalize(COLOR_NAMES[winner])} wins. Well fought.`;
    } else if (c.isStalemate()) result = "Stalemate. It's a draw.";
    else if (c.isThreefoldRepetition()) result = "Draw by threefold repetition.";
    else if (c.isInsufficientMaterial()) result = "Draw. Neither side has enough material to mate.";
    else result = "Draw by the fifty-move rule.";
    this.finish(result);
    return true;
  }

  private finish(result: string) {
    this.set({ phase: 'over', result, pending: null, thinking: false, pgn: this.chess.pgn() });
  }
}

const ILLEGAL_PHRASES = ['Illegal move.', 'That move is not possible.', 'Not legal. Try again.'];
const pickPhrase = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "the one from b1", "b1", "first", "second" -> candidate. */
function pickCandidate(candidates: Move[], alts: string[]): Move | null {
  for (const alt of alts) {
    const t = alt.toLowerCase().replace(/\s+/g, '');
    const byFrom = candidates.filter((m) => t.includes(m.from));
    if (byFrom.length === 1) return byFrom[0];
    const ord = ['first', 'second', 'third', 'fourth'].findIndex((w) => t.includes(w));
    if (ord >= 0 && candidates[ord]) return candidates[ord];
  }
  return null;
}
