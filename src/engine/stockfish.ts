import { Chess } from 'chess.js';

/** Bot strength levels shown to the player (1 = beginner, 8 = strongest). */
export interface Level {
  id: number;
  label: string;
  skill: number;
  depth?: number;
  movetime?: number;
}

export const LEVELS: Level[] = [
  { id: 1, label: 'Padati — beginner', skill: 0, depth: 1 },
  { id: 2, label: 'Ashva — novice', skill: 2, depth: 2 },
  { id: 3, label: 'Gaja — casual', skill: 5, depth: 4 },
  { id: 4, label: 'Ratha — club', skill: 8, depth: 6 },
  { id: 5, label: 'Mantri — strong club', skill: 11, depth: 8 },
  { id: 6, label: 'Raja — expert', skill: 14, movetime: 500 },
  { id: 7, label: 'Maharaja — master', skill: 17, movetime: 1000 },
  { id: 8, label: 'Chakravartin — full strength', skill: 20, movetime: 1500 },
];

export interface MoveSource {
  bestMove(fen: string, level: number): Promise<string>;
}

/** Stockfish running in a Web Worker, talking UCI. */
export class StockfishEngine implements MoveSource {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(url = `${import.meta.env.BASE_URL}engine/stockfish.js`) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      this.listeners.forEach((l) => l(line));
    };
    this.ready = (async () => {
      this.send('uci');
      await this.waitFor((l) => l === 'uciok', 20000);
      this.send('isready');
      await this.waitFor((l) => l === 'readyok', 20000);
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(fn);
        reject(new Error('Engine timed out'));
      }, timeoutMs);
      const fn = (line: string) => {
        if (!pred(line)) return;
        clearTimeout(timer);
        this.listeners.delete(fn);
        resolve(line);
      };
      this.listeners.add(fn);
    });
  }

  newGame() {
    this.busy = this.busy.then(() => this.ready).then(() => this.send('ucinewgame')).catch(() => {});
  }

  bestMove(fen: string, levelId: number): Promise<string> {
    const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[2];
    const run = async () => {
      await this.ready;
      this.send(`setoption name Skill Level value ${level.skill}`);
      this.send(`position fen ${fen}`);
      this.send(level.depth ? `go depth ${level.depth}` : `go movetime ${level.movetime}`);
      const line = await this.waitFor((l) => l.startsWith('bestmove'), 30000);
      return line.split(/\s+/)[1];
    };
    const p = this.busy.then(run, run);
    this.busy = p.catch(() => {});
    return p;
  }

  dispose() {
    this.worker.terminate();
  }
}

/** Fallback when the engine can't load: prefers captures and checks, otherwise random. */
export class SimpleEngine implements MoveSource {
  async bestMove(fen: string): Promise<string> {
    const c = new Chess(fen);
    const moves = c.moves({ verbose: true });
    const good = moves.filter((m) => m.captured || m.san.includes('+'));
    const pool = good.length && Math.random() < 0.7 ? good : moves;
    const m = pool[Math.floor(Math.random() * pool.length)];
    return m.from + m.to + (m.promotion ?? '');
  }
}

/** Starts Stockfish, falling back to SimpleEngine if workers/WASM aren't available. */
export function createEngine(): MoveSource & { newGame?: () => void } {
  try {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return new SimpleEngine();
    const sf = new StockfishEngine();
    const fallback = new SimpleEngine();
    let failed = false;
    return {
      newGame: () => sf.newGame(),
      async bestMove(fen, level) {
        if (failed) return fallback.bestMove(fen);
        try {
          return await sf.bestMove(fen, level);
        } catch (e) {
          console.warn('Stockfish failed, using simple engine', e);
          failed = true;
          return fallback.bestMove(fen);
        }
      },
    };
  } catch {
    return new SimpleEngine();
  }
}
