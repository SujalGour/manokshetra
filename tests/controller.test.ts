import { describe, expect, it } from 'vitest';
import { GameController, type GameSettings } from '../src/game/controller';
import type { MoveSource } from '../src/engine/stockfish';

class ScriptedEngine implements MoveSource {
  constructor(private moves: string[]) {}
  async bestMove() {
    return this.moves.shift()!;
  }
}

function setup(botMoves: string[], overrides: Partial<GameSettings> = {}) {
  const spoken: string[] = [];
  const speaker = { speak: async (t: string) => void spoken.push(t), cancel() {} };
  const g = new GameController(new ScriptedEngine(botMoves), speaker);
  const settings: GameSettings = { color: 'w', level: 1, confirmMoves: false, autoExplain: false, peekSeconds: 5, ...overrides };
  return { g, spoken, settings };
}

describe('GameController', () => {
  it('plays a move, echoes it, and narrates the reply', async () => {
    const { g, spoken, settings } = setup(['e7e5']);
    await g.start(settings);
    await g.handleInput(['knight f3']);
    expect(g.state.moves).toEqual(['Nf3', 'e5']);
    expect(spoken).toContain('Knight to F 3.');
    expect(spoken.at(-1)).toBe('Black: Pawn to E 5.');
  });

  it('counts illegal moves and explains on "why"', async () => {
    const { g, spoken, settings } = setup([]);
    await g.start(settings);
    await g.handleInput(['bishop c4']);
    expect(g.state.illegal).toBe(1);
    await g.handleInput(['why']);
    expect(spoken.at(-1)).toMatch(/blocked by your pawn on E 2/);
  });

  it('asks for confirmation when enabled', async () => {
    const { g, spoken, settings } = setup(['e7e5'], { confirmMoves: true });
    await g.start(settings);
    await g.handleInput(['e4']);
    expect(spoken.at(-1)).toBe('Pawn to E 4?');
    await g.handleInput(['yes']);
    expect(g.state.moves).toEqual(['e4', 'e5']);
  });

  it('clarifies an ambiguous move', async () => {
    const { g, spoken, settings } = setup(['e7e5', 'g8f6', 'b8c6']);
    await g.start(settings);
    await g.handleInput(['knight f3']);
    await g.handleInput(['d3']);
    await g.handleInput(['knight d2']);
    expect(spoken.at(-1)).toMatch(/^Which one\?/);
    await g.handleInput(['the one from b1']);
    expect(g.state.moves.slice(4)).toEqual(['Nbd2', 'Nc6']);
  });

  it('bot moves first when the player is black, and repeats on request', async () => {
    const { g, spoken, settings } = setup(['e2e4'], { color: 'b' });
    await g.start(settings);
    expect(g.state.moves).toEqual(['e4']);
    await g.handleInput(['repeat']);
    expect(spoken.at(-1)).toBe('My last move: Pawn to E 4.');
  });

  it('detects checkmate', async () => {
    const { g, settings } = setup(['e7e5', 'f8c5', 'b8c6']);
    await g.start(settings);
    for (const m of ['e4', 'bishop c4', 'queen h5', 'queen takes f7']) await g.handleInput([m]);
    expect(g.state.phase).toBe('over');
    expect(g.state.result).toMatch(/You win/);
  });

  it('counts peeks', async () => {
    const { g, settings } = setup([]);
    await g.start(settings);
    await g.handleInput(['show me the board']);
    expect(g.state.peeks).toBe(1);
    expect(g.state.peekUntil).toBeGreaterThan(Date.now());
  });
});
