import type { Move, PieceSymbol, Square, Color } from 'chess.js';

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export const COLOR_NAMES: Record<Color, string> = { w: 'white', b: 'black' };

/** A spoken line plus the same line for the screen. */
export interface Line {
  text: string;
  speech: string;
}

/** "f3" -> "F 3" so speech engines say the letter instead of reading a word. */
export function sayS(square: string): string {
  return `${square[0].toUpperCase()} ${square.slice(1)}`;
}

/** Builds a sentence from parts that are either plain words or squares. */
function line(parts: (string | { sq: string })[]): Line {
  const text = parts.map((p) => (typeof p === 'string' ? p : p.sq)).join(' ');
  const speech = parts.map((p) => (typeof p === 'string' ? p : sayS(p.sq))).join(' ');
  return { text, speech };
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Natural description of a move, e.g. "Bishop takes on c6, check." */
export function describeMove(move: Move): Line {
  const suffix = move.san.endsWith('#') ? ', checkmate' : move.san.endsWith('+') ? ', check' : '';
  let parts: (string | { sq: string })[];

  if (move.flags.includes('k')) parts = ['castles kingside'];
  else if (move.flags.includes('q')) parts = ['castles queenside'];
  else if (move.piece === 'p') {
    if (move.captured) {
      parts = [move.from[0].toUpperCase(), 'pawn takes', { sq: move.to }];
      if (move.flags.includes('e')) parts.push('en passant');
    } else {
      parts = ['pawn to', { sq: move.to }];
    }
    if (move.promotion) parts.push(`, promotes to ${PIECE_NAMES[move.promotion]}`);
  } else {
    // Mention the origin square only when SAN had to disambiguate.
    const sanBody = move.san.replace(/[+#]/g, '');
    const disambiguated = sanBody.replace('x', '').length > 3;
    parts = [PIECE_NAMES[move.piece]];
    if (disambiguated) parts.push('from', { sq: move.from });
    parts.push(move.captured ? 'takes on' : 'to', { sq: move.to });
  }
  const l = line(parts);
  const fix = (s: string) => capitalize(s.replace(/ ,/g, ',') + suffix + '.');
  return { text: fix(l.text), speech: fix(l.speech) };
}

/** Short version for confirming the player's own move: "Knight f3?" */
export function describeMoveShort(move: Move): Line {
  const d = describeMove(move);
  return { text: d.text.replace(/\.$/, ''), speech: d.speech.replace(/\.$/, '') };
}

export function pieceOn(color: Color, piece: PieceSymbol, square: Square, own: Color): Line {
  const who = color === own ? 'your' : `${COLOR_NAMES[color]}'s`;
  return line([who, PIECE_NAMES[piece], 'on', { sq: square }]);
}

/** Joins lines with spaces, keeping text and speech in step. */
export function join(...lines: (Line | string)[]): Line {
  const ls = lines.map((l) => (typeof l === 'string' ? { text: l, speech: l } : l));
  return { text: ls.map((l) => l.text).join(' '), speech: ls.map((l) => l.speech).join(' ') };
}

/** Template helper: tpl`Your knight left ${sq('g1')} on move 6.` */
export function tpl(strings: TemplateStringsArray, ...values: (string | { sq: string } | Line)[]): Line {
  let text = strings[0];
  let speech = strings[0];
  values.forEach((v, i) => {
    const t = typeof v === 'string' ? v : 'sq' in v ? v.sq : v.text;
    const sp = typeof v === 'string' ? v : 'sq' in v ? sayS(v.sq) : v.speech;
    text += t + strings[i + 1];
    speech += sp + strings[i + 1];
  });
  return { text, speech };
}

export const sq = (s: string) => ({ sq: s });
