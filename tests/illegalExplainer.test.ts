import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { explainIllegal } from '../src/coach/illegalExplainer';
import { parseMove } from '../src/parser/moveParser';

function why(chess: Chess, text: string): string {
  const r = parseMove(chess, text);
  if (r.kind !== 'illegal') throw new Error(`expected illegal, got ${r.kind}`);
  return explainIllegal(chess, r.intent).text;
}

function play(...sans: string[]) {
  const c = new Chess();
  sans.forEach((s) => c.move(s));
  return c;
}

describe('explainIllegal', () => {
  it('path blocked by own pawn', () => {
    expect(why(new Chess(), 'bishop c4')).toMatch(/blocked by your pawn on e2/);
  });

  it('piece that moved away earlier', () => {
    const c = play('Nf3', 'e5', 'Nd4', 'Nc6', 'e3', 'Nf6');
    // The g1 knight went f3 then d4; "knight from g1 to f3" is impossible now.
    expect(why(c, 'knight g1 f3')).toMatch(/g1 is empty\. Your knight left g1 on move 1, going to f3/);
  });

  it('wrong piece on the square', () => {
    expect(why(new Chess(), 'knight a1 a3')).toMatch(/On a1 you have a rook, not a knight/);
  });

  it('target occupied by own piece', () => {
    expect(why(new Chess(), 'knight d2')).toMatch(/d2 is occupied by your own pawn/);
  });

  it('pawn capture onto an empty square', () => {
    expect(why(new Chess(), 'e takes d3')).toMatch(/can only move diagonally to capture, and d3 is empty/);
  });

  it('pinned piece', () => {
    const c = play('e4', 'e5', 'Nc3', 'Bb4', 'd3', 'Nf6');
    // d2 is empty, so the c3 knight is pinned against e1 by the b4 bishop.
    expect(why(c, 'knight d5')).toMatch(/pinned to your king by black's bishop on b4/);
  });

  it('king walking into attack', () => {
    const c = new Chess('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');
    expect(why(c, 'king e2')).toMatch(/covered by black's rook on d2/);
  });

  it('castling after the king moved', () => {
    const c = play('e4', 'e5', 'Ke2', 'Nc6', 'Ke1', 'Nf6', 'Nf3', 'Bc5', 'Bc4', 'd6');
    expect(why(c, 'castle kingside')).toMatch(/your king moved on move 2/);
  });

  it('castling with a piece in the way', () => {
    expect(why(new Chess(), 'castle kingside')).toMatch(/bishop on f1 is in the way/);
  });

  it('no pieces of that type left', () => {
    const c = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(why(c, 'queen d4')).toMatch(/You have no queens/);
  });
});
