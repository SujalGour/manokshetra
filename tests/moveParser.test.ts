import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { parseMove, parseMoveAlternatives } from '../src/parser/moveParser';

const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
// White can castle both ways; knights on b1/f3 both reach d2.
const CASTLE_READY = 'r3k2r/pppq1ppp/2npbn2/4p3/4P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1';
const PROMO = '8/4P1k1/8/8/8/8/6K1/8 w - - 0 1';

function san(fen: string, text: string) {
  const r = parseMove(new Chess(fen), text);
  return r.kind === 'move' ? r.move.san : r.kind;
}

describe('parseMove: spoken forms', () => {
  const start = new Chess().fen();
  it.each([
    ['e4', 'e4'],
    ['E4', 'e4'],
    ['e 4', 'e4'],
    ['e four', 'e4'],
    ['pawn to e4', 'e4'],
    ['pawn e four', 'e4'],
    ['echo four', 'e4'],
    ['e2 e4', 'e4'],
    ['e2 to e4', 'e4'],
    ['e2-e4', 'e4'],
    ['Knight f3', 'Nf3'],
    ['knight to f3', 'Nf3'],
    ['Knight to F3.', 'Nf3'],
    ['night f3', 'Nf3'],
    ['horse f three', 'Nf3'],
    ['Nf3', 'Nf3'],
    ['g1 f3', 'Nf3'],
    ['knight c3', 'Nc3'],
    ['knight see three', 'Nc3'],
    ['d4', 'd4'],
    ['delta four', 'd4'],
    ['dee four', 'd4'],
    ['c4', 'c4'],
    ['see for', 'c4'],
    ['b4', 'b4'],
    ['before', 'b4'],
    ['bee four', 'b4'],
    ['a3', 'a3'],
    ['a three', 'a3'],
    ['h4', 'h4'],
    ['aitch four', 'h4'],
  ])('%s -> %s', (text, expected) => expect(san(start, text)).toBe(expected));
});

describe('parseMove: captures and pieces', () => {
  const fen = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
  it.each([
    ['e takes d5', 'exd5'],
    ['exd5', 'exd5'],
    ['pawn takes d5', 'exd5'],
    ['e takes d', 'exd5'],
    ['knight takes e5', 'Nxe5'],
    ['knight takes on e5', 'Nxe5'],
    ['bishop b5 check', 'Bb5+'],
    ['bishop be five', 'Bb5+'],
    ['Bb5', 'Bb5+'],
    ['queen e2', 'Qe2'],
  ])('%s -> %s', (text, expected) => expect(san(fen, text)).toBe(expected));
});

describe('parseMove: castling', () => {
  it.each([
    ['castle kingside', 'O-O'],
    ['castles king side', 'O-O'],
    ['castle short', 'O-O'],
    ['short castle', 'O-O'],
    ['O-O', 'O-O'],
    ['0-0', 'O-O'],
    ['castle queenside', 'O-O-O'],
    ['castle long', 'O-O-O'],
    ['o-o-o', 'O-O-O'],
    ['king g1', 'O-O'],
  ])('%s -> %s', (text, expected) => expect(san(CASTLE_READY, text)).toBe(expected));

  it('plain "castle" with both options is ambiguous', () => {
    expect(parseMove(new Chess(CASTLE_READY), 'castle').kind).toBe('ambiguous');
  });
});

describe('parseMove: disambiguation', () => {
  const TWO_KNIGHTS = '4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1';
  it('asks which knight', () => {
    const r = parseMove(new Chess(TWO_KNIGHTS), 'knight d2');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((m) => m.from).sort()).toEqual(['b1', 'f3']);
  });
  it.each([
    ['knight b d2', 'Nbd2'],
    ['knight bravo d2', 'Nbd2'],
    ['knight from b1 to d2', 'Nbd2'],
    ['knight f d2', 'Nfd2'],
    ['Nfd2', 'Nfd2'],
  ])('%s -> %s', (text, expected) => expect(san(TWO_KNIGHTS, text)).toBe(expected));
});

describe('parseMove: promotion', () => {
  it.each([
    ['e8', 'e8=Q'],
    ['e8 queen', 'e8=Q'],
    ['e8 promote to knight', 'e8=N+'],
    ['e8 equals rook', 'e8=R'],
    ['e8=Q', 'e8=Q'],
    ['pawn to e8 knight', 'e8=N+'],
  ])('%s -> %s', (text, expected) => expect(san(PROMO, text)).toBe(expected));
});

describe('parseMove: illegal and loose', () => {
  it('reports an illegal move with the intent kept', () => {
    const r = parseMove(new Chess(), 'bishop c4');
    expect(r.kind).toBe('illegal');
    if (r.kind === 'illegal') expect(r.intent).toMatchObject({ piece: 'b', to: 'c4' });
  });
  it('offers the knight when the piece name is dropped', () => {
    const r = parseMove(new Chess(), 'f3 please');
    // f3 is a legal pawn move, so it's taken literally.
    expect(r.kind).toBe('move');
    const r2 = parseMove(new Chess(AFTER_E4_E5), 'e2');
    expect(r2.kind).toBe('ambiguous');
    if (r2.kind === 'ambiguous') expect(r2.loose).toBe(true);
  });
  it('returns none for chatter', () => {
    expect(parseMove(new Chess(), 'hello there').kind).toBe('none');
  });
});

describe('parseMoveAlternatives', () => {
  it('uses a later alternative when the first is garbage', () => {
    const r = parseMoveAlternatives(new Chess(), ['night of three', 'knight f3']);
    expect(r.kind === 'move' && r.move.san).toBe('Nf3');
  });
});
