import type { Chess, Move, PieceSymbol, Square } from 'chess.js';

/**
 * What the player *meant*, extracted from speech before checking legality.
 * Kept even when the move is illegal so the coach can explain what went wrong.
 */
export interface MoveIntent {
  raw: string;
  piece?: PieceSymbol;
  from?: Square;
  fromFile?: string;
  fromRank?: string;
  to?: Square;
  /** Target file only, e.g. "e takes d" (pawn capture without a rank). */
  toFile?: string;
  capture: boolean;
  castle?: 'k' | 'q' | 'either';
  promotion?: PieceSymbol;
}

export type ParseResult =
  | { kind: 'move'; move: Move; intent: MoveIntent }
  /** Several legal moves fit, or one fits only loosely ("f3" when only a knight can go there). */
  | { kind: 'ambiguous'; candidates: Move[]; intent: MoveIntent; loose: boolean }
  | { kind: 'illegal'; intent: MoveIntent }
  | { kind: 'none' };

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const PIECE_WORDS: Record<string, PieceSymbol> = {
  knight: 'n', knights: 'n', night: 'n', nights: 'n', nite: 'n', horse: 'n', horsey: 'n', kn: 'n',
  bishop: 'b', bishops: 'b', bish: 'b',
  rook: 'r', rooks: 'r', rock: 'r', ruk: 'r', tower: 'r',
  queen: 'q', queens: 'q', lady: 'q',
  king: 'k', kings: 'k',
  pawn: 'p', pawns: 'p', porn: 'p', pond: 'p', prawn: 'p', paun: 'p',
};

/** File words. `weak` words are only trusted right before a rank ("a" is also an article). */
const FILE_WORDS: Record<string, { file: string; weak?: boolean }> = {
  a: { file: 'a', weak: true }, ay: { file: 'a', weak: true }, alpha: { file: 'a' }, alfa: { file: 'a' },
  b: { file: 'b' }, be: { file: 'b', weak: true }, bee: { file: 'b' }, bravo: { file: 'b' },
  c: { file: 'c' }, see: { file: 'c', weak: true }, sea: { file: 'c', weak: true }, si: { file: 'c', weak: true }, charlie: { file: 'c' },
  d: { file: 'd' }, dee: { file: 'd' }, delta: { file: 'd' },
  e: { file: 'e' }, ee: { file: 'e', weak: true }, echo: { file: 'e' },
  f: { file: 'f' }, ef: { file: 'f' }, eff: { file: 'f' }, foxtrot: { file: 'f' },
  g: { file: 'g' }, gee: { file: 'g' }, ji: { file: 'g', weak: true }, golf: { file: 'g' },
  h: { file: 'h' }, aitch: { file: 'h' }, hotel: { file: 'h' }, age: { file: 'h', weak: true }, each: { file: 'h', weak: true },
};

/** Rank words. `weak` words ("to", "for") are only trusted right after a file. */
const RANK_WORDS: Record<string, { rank: string; weak?: boolean }> = {
  '1': { rank: '1' }, one: { rank: '1' }, won: { rank: '1', weak: true },
  '2': { rank: '2' }, two: { rank: '2' }, to: { rank: '2', weak: true }, too: { rank: '2', weak: true },
  '3': { rank: '3' }, three: { rank: '3' }, tree: { rank: '3', weak: true }, free: { rank: '3', weak: true },
  '4': { rank: '4' }, four: { rank: '4' }, for: { rank: '4', weak: true }, fore: { rank: '4', weak: true },
  '5': { rank: '5' }, five: { rank: '5' },
  '6': { rank: '6' }, six: { rank: '6' }, sex: { rank: '6', weak: true }, sicks: { rank: '6', weak: true },
  '7': { rank: '7' }, seven: { rank: '7' },
  '8': { rank: '8' }, eight: { rank: '8' }, ate: { rank: '8', weak: true },
};

/** Whole words that recognizers produce for a spoken square. */
const SQUARE_WORDS: Record<string, string> = {
  before: 'b4', beforehand: 'b4', seafood: 'c4', seaford: 'c4', defour: 'd4', eforce: 'e4',
};

const CAPTURE_WORDS = new Set(['takes', 'take', 'took', 'taking', 'captures', 'capture', 'captured', 'x']);
const CASTLE_WORDS = new Set(['castle', 'castles', 'castling', 'castled']);
const KINGSIDE_WORDS = new Set(['kingside', 'short']);
const QUEENSIDE_WORDS = new Set(['queenside', 'long']);
const PROMO_WORDS = new Set(['promote', 'promotes', 'promoting', 'promotion', 'equals', '=', 'becomes', 'queening']);

type Sym =
  | { t: 'piece'; v: PieceSymbol }
  | { t: 'file'; v: string; weak: boolean }
  | { t: 'rank'; v: string; weak: boolean }
  | { t: 'square'; v: Square }
  | { t: 'capture' }
  | { t: 'castle' }
  | { t: 'side'; v: 'k' | 'q' }
  | { t: 'promo' };

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

const SAN_RE = /^([nbrqk])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([nbrq]))?[+#!?]*$/;

/** Turns one utterance into one or more symbol streams (a token like "bc6" can be read two ways). */
function tokenize(text: string): Sym[][] {
  let s = ` ${text.toLowerCase()} `;
  // Castling notation.
  s = s.replace(/\b[o0]\s*-\s*[o0]\s*-\s*[o0]\b/g, ' castle queenside ');
  s = s.replace(/\b[o0]\s*-\s*[o0]\b/g, ' castle kingside ');
  s = s.replace(/\bking\s*side\b/g, ' kingside ').replace(/\bqueen\s*side\b/g, ' queenside ');
  s = s.replace(/[,.;:!?()"]/g, ' ').replace(/\+|#/g, ' ').replace(/-/g, ' ');

  let streams: Sym[][] = [[]];
  const push = (...syms: Sym[]) => streams.forEach((st) => st.push(...syms));

  for (const word of s.split(/\s+/).filter(Boolean)) {
    if (PIECE_WORDS[word]) { push({ t: 'piece', v: PIECE_WORDS[word] }); continue; }
    if (CAPTURE_WORDS.has(word)) { push({ t: 'capture' }); continue; }
    if (CASTLE_WORDS.has(word)) { push({ t: 'castle' }); continue; }
    if (KINGSIDE_WORDS.has(word)) { push({ t: 'side', v: 'k' }); continue; }
    if (QUEENSIDE_WORDS.has(word)) { push({ t: 'side', v: 'q' }); continue; }
    if (PROMO_WORDS.has(word)) { push({ t: 'promo' }); continue; }
    if (SQUARE_WORDS[word]) { push({ t: 'square', v: SQUARE_WORDS[word] as Square }); continue; }
    if (FILE_WORDS[word]) { const f = FILE_WORDS[word]; push({ t: 'file', v: f.file, weak: !!f.weak }); continue; }
    if (RANK_WORDS[word]) { const r = RANK_WORDS[word]; push({ t: 'rank', v: r.rank, weak: !!r.weak }); continue; }

    // "e4", "nf3", "bxc6", "e8q", "nbd2", "r1e1" ...
    const m = SAN_RE.exec(word);
    if (m) {
      const [, p, ff, fr, x, sq, promo] = m;
      const build = (piece: string | undefined, fromFile: string | undefined): Sym[] => {
        const out: Sym[] = [];
        if (piece) out.push({ t: 'piece', v: piece as PieceSymbol });
        if (fromFile && fr) out.push({ t: 'square', v: (fromFile + fr) as Square });
        else {
          if (fromFile) out.push({ t: 'file', v: fromFile, weak: false });
          if (fr) out.push({ t: 'rank', v: fr, weak: false });
        }
        if (x) out.push({ t: 'capture' });
        out.push({ t: 'square', v: sq as Square });
        if (promo) out.push({ t: 'promo' }, { t: 'piece', v: promo as PieceSymbol });
        return out;
      };
      if (p === 'b' && !ff) {
        // "bc6" / "bxc6": bishop to c6, or the b-pawn capturing on c6.
        const a = build('b', undefined);
        const b = build(undefined, 'b');
        streams = streams.flatMap((st) => [[...st, ...a], [...st, ...b]]);
      } else {
        push(...build(p, ff));
      }
      continue;
    }
    // "e 4" glued as "e4"-like with words: "f3." handled above; anything else is filler.
  }
  return streams;
}

/** Joins file+rank pairs into squares and drops weak leftovers. */
function combine(syms: Sym[]): Sym[] {
  const out: Sym[] = [];
  for (let i = 0; i < syms.length; i++) {
    const a = syms[i];
    const b = syms[i + 1];
    if (a.t === 'file' && b && b.t === 'rank') {
      out.push({ t: 'square', v: (a.v + b.v) as Square });
      i++;
      continue;
    }
    if ((a.t === 'file' || a.t === 'rank') && a.weak) continue;
    out.push(a);
  }
  return out;
}

function buildIntent(raw: string, syms: Sym[]): MoveIntent | null {
  const intent: MoveIntent = { raw, capture: false };
  const hasCastle = syms.some((s) => s.t === 'castle');
  if (hasCastle) {
    const side = syms.find((s) => s.t === 'side') as { v: 'k' | 'q' } | undefined;
    // "castle king side" may arrive as piece words.
    const pieceSide = syms.find((s) => s.t === 'piece' && (s.v === 'k' || s.v === 'q')) as { v: 'k' | 'q' } | undefined;
    intent.castle = side?.v ?? pieceSide?.v ?? 'either';
    intent.piece = 'k';
    return intent;
  }

  const squares = syms.flatMap((s, i) => (s.t === 'square' ? [{ v: s.v, i }] : []));
  let promoIdx = syms.findIndex((s) => s.t === 'promo');

  // Piece = first piece word not part of a promotion.
  for (let i = 0; i < syms.length; i++) {
    const s = syms[i];
    if (s.t !== 'piece') continue;
    const afterPromo = promoIdx >= 0 && i > promoIdx;
    const afterLastRankSquare = squares.length > 0 && i > squares[squares.length - 1].i && /[18]$/.test(squares[squares.length - 1].v);
    if (afterPromo || (afterLastRankSquare && s.v !== 'k' && s.v !== 'p')) {
      intent.promotion = s.v;
      if (promoIdx < 0) promoIdx = i;
    } else if (!intent.piece) {
      intent.piece = s.v;
    }
  }

  intent.capture = syms.some((s) => s.t === 'capture');

  if (squares.length >= 2) {
    intent.from = squares[0].v;
    intent.to = squares[squares.length - 1].v;
  } else if (squares.length === 1) {
    intent.to = squares[0].v;
    const toIdx = squares[0].i;
    for (let i = 0; i < toIdx; i++) {
      const s = syms[i];
      if (s.t === 'file') intent.fromFile = s.v;
      if (s.t === 'rank') intent.fromRank = s.v;
    }
  } else {
    // "e takes d" -> pawn capture by file.
    const files = syms.filter((s) => s.t === 'file') as { v: string }[];
    if (intent.capture && files.length === 2) {
      intent.fromFile = files[0].v;
      intent.toFile = files[1].v;
      intent.piece ??= 'p';
    } else {
      return null;
    }
  }
  return intent;
}

// ---------------------------------------------------------------------------
// Resolving against legal moves
// ---------------------------------------------------------------------------

function matches(m: Move, it: MoveIntent, piece: PieceSymbol | undefined): boolean {
  if (it.castle) {
    const isK = m.flags.includes('k');
    const isQ = m.flags.includes('q');
    return it.castle === 'k' ? isK : it.castle === 'q' ? isQ : isK || isQ;
  }
  if (piece && m.piece !== piece) return false;
  if (it.to && m.to !== it.to) return false;
  if (it.toFile && m.to[0] !== it.toFile) return false;
  if (it.from && m.from !== it.from) return false;
  if (it.fromFile && m.from[0] !== it.fromFile) return false;
  if (it.fromRank && m.from[1] !== it.fromRank) return false;
  if (it.promotion && m.promotion !== it.promotion) return false;
  return true;
}

/** Collapses promotion choices to a queen when the player didn't say which piece. */
function preferQueen(moves: Move[], it: MoveIntent): Move[] {
  if (it.promotion || moves.length < 2 || !moves.every((m) => m.promotion)) return moves;
  const same = moves.every((m) => m.from === moves[0].from && m.to === moves[0].to);
  return same ? moves.filter((m) => m.promotion === 'q') : moves;
}

function resolve(chess: Chess, it: MoveIntent): ParseResult {
  const legal = chess.moves({ verbose: true });
  const explicitPiece = it.piece;
  // With only a target square, standard notation means a pawn ("f3" = pawn to f3).
  const pieceFilter = explicitPiece ?? (it.from || it.castle ? undefined : 'p');
  let found = preferQueen(legal.filter((m) => matches(m, it, pieceFilter)), it);

  if (found.length > 1 && it.capture) {
    const caps = found.filter((m) => m.captured);
    if (caps.length) found = caps;
  }
  if (found.length === 1) return { kind: 'move', move: found[0], intent: it };
  if (found.length > 1) return { kind: 'ambiguous', candidates: found, intent: it, loose: false };

  if (!explicitPiece && !it.from && !it.castle) {
    // No pawn fits. Maybe the player dropped the piece name: offer what does fit.
    const loose = preferQueen(legal.filter((m) => matches(m, it, undefined)), it);
    if (loose.length) return { kind: 'ambiguous', candidates: loose, intent: it, loose: true };
  }
  return { kind: 'illegal', intent: it };
}

const RANK_ORDER: Record<ParseResult['kind'], number> = { move: 3, ambiguous: 2, illegal: 1, none: 0 };

/** Parses one transcript into the best interpretation. */
export function parseMove(chess: Chess, text: string): ParseResult {
  let best: ParseResult = { kind: 'none' };
  for (const stream of tokenize(text)) {
    const intent = buildIntent(text, combine(stream));
    if (!intent) continue;
    const r = resolve(chess, intent);
    if (RANK_ORDER[r.kind] > RANK_ORDER[best.kind]) best = r;
    // Two readings of "bc6" that both work: let the player choose.
    else if (r.kind === 'move' && best.kind === 'move' && r.move.san !== best.move.san) {
      best = { kind: 'ambiguous', candidates: [best.move, r.move], intent, loose: false };
    }
  }
  return best;
}

/**
 * Parses the recognizer's alternatives (best first). A legal move in any alternative wins,
 * because the recognizer's top guess is often a near-miss ("night f3").
 */
export function parseMoveAlternatives(chess: Chess, alternatives: string[]): ParseResult {
  let best: ParseResult = { kind: 'none' };
  for (const alt of alternatives) {
    const r = parseMove(chess, alt);
    if (RANK_ORDER[r.kind] > RANK_ORDER[best.kind]) best = r;
    if (best.kind === 'move') break;
  }
  return best;
}
