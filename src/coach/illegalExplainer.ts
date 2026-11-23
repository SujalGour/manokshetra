import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { MoveIntent } from '../parser/moveParser';
import { COLOR_NAMES, PIECE_NAMES, join, sq, tpl, type Line } from '../speech/phrasing';

/**
 * Explains why a move the player asked for is illegal, in terms of what they
 * probably lost track of ("your knight left g1 on move 6").
 */
export function explainIllegal(chess: Chess, intent: MoveIntent): Line {
  const me = chess.turn();
  const history = chess.history({ verbose: true });
  if (intent.castle) return explainCastle(chess, intent.castle, history);

  if (intent.from) return explainFromSquare(chess, intent, history);

  const piece = intent.piece ?? 'p';
  const name = PIECE_NAMES[piece];
  let mine = squaresOf(chess, me, piece);
  if (intent.fromFile) mine = mine.filter((s) => s[0] === intent.fromFile);
  if (intent.fromRank) mine = mine.filter((s) => s[1] === intent.fromRank);

  if (!intent.to) return { text: `None of your ${name}s can make that capture.`, speech: `None of your ${name}s can make that capture.` };
  const to = intent.to;

  const own = chess.get(to);
  if (own && own.color === me) {
    return tpl`${sq(to)} is occupied by your own ${PIECE_NAMES[own.type]}.`;
  }

  if (squaresOf(chess, me, piece).length === 0) {
    const lost = [...history].reverse().find((m) => m.color !== me && m.captured === piece);
    if (lost) {
      return tpl`You have no ${name}s left. Your last ${name} was captured on ${sq(lost.to)} on move ${String(moveNumber(history, lost))}.`;
    }
    return { text: `You have no ${name}s.`, speech: `You have no ${name}s.` };
  }

  if (mine.length === 0) {
    const where = intent.fromFile ? `on the ${intent.fromFile}-file` : `on rank ${intent.fromRank}`;
    return { text: `You have no ${name} ${where}.`, speech: `You have no ${name} ${where}.` };
  }

  // A piece that *used to* be able to make this move has since moved away.
  const drifted = [...history]
    .reverse()
    .find((m) => m.color === me && m.piece === piece && reachesOnEmptyBoard(piece, me, m.from, to));
  const driftNote = drifted && !squaresOf(chess, me, piece).includes(drifted.from as Square)
    ? tpl`Your ${name} on ${sq(drifted.from)} moved to ${sq(drifted.to)} on move ${String(moveNumber(history, drifted))}.`
    : null;

  if (mine.length === 1) {
    const reason = explainPieceTo(chess, mine[0], to);
    return driftNote ? join(reason, driftNote) : reason;
  }
  const list = listSquares(mine);
  const reasons = mine.map((s) => explainPieceTo(chess, s, to, true));
  return join(tpl`Your ${name}s are on ${list}.`, ...reasons, ...(driftNote ? [driftNote] : []));
}

function explainFromSquare(chess: Chess, intent: MoveIntent, history: Move[]): Line {
  const me = chess.turn();
  const from = intent.from!;
  const p = chess.get(from);
  if (!p) {
    const left = [...history].reverse().find((m) => m.from === from);
    if (left) {
      const who = left.color === me ? 'Your' : `${cap(COLOR_NAMES[left.color])}'s`;
      return tpl`${sq(from)} is empty. ${who} ${PIECE_NAMES[left.piece]} left ${sq(from)} on move ${String(moveNumber(history, left))}, going to ${sq(left.to)}.`;
    }
    return tpl`${sq(from)} is empty.`;
  }
  if (p.color !== me) return tpl`${sq(from)} has ${COLOR_NAMES[p.color]}'s ${PIECE_NAMES[p.type]}, not one of yours.`;
  if (intent.piece && intent.piece !== p.type) {
    return tpl`On ${sq(from)} you have a ${PIECE_NAMES[p.type]}, not a ${PIECE_NAMES[intent.piece]}.`;
  }
  if (!intent.to) return { text: 'That move is not legal.', speech: 'That move is not legal.' };
  return explainPieceTo(chess, from, intent.to);
}

/** Why the piece on `from` cannot go to `to`. `short` drops the subject for lists. */
function explainPieceTo(chess: Chess, from: Square, to: Square, short = false): Line {
  const me = chess.turn();
  const p = chess.get(from)!;
  const name = PIECE_NAMES[p.type];
  const subject = tpl`${short ? 'The' : 'Your'} ${name} on ${sq(from)}`;
  const target = chess.get(to);

  if (target && target.color === me) return join(subject, tpl`can't go to ${sq(to)}: your own ${PIECE_NAMES[target.type]} is there.`);

  if (p.type === 'p') {
    const dir = me === 'w' ? 1 : -1;
    const df = file(to) - file(from);
    const dr = rank(to) - rank(from);
    if (df !== 0 && Math.abs(df) === 1 && dr === dir && !target && chess.fen().split(' ')[3] !== to) {
      return join(subject, tpl`can only move diagonally to capture, and ${sq(to)} is empty.`);
    }
    if (df === 0 && target) return join(subject, tpl`is blocked: ${COLOR_NAMES[target.color]}'s ${PIECE_NAMES[target.type]} is on ${sq(to)}.`);
  }

  if (!reachesOnEmptyBoard(p.type, me, from, to)) {
    return join(subject, tpl`can't reach ${sq(to)}${p.type === 'p' ? '' : ` — a ${name} doesn't move that way`}.`);
  }

  const blocker = between(from, to).find((s) => chess.get(s));
  if (blocker) {
    const b = chess.get(blocker)!;
    const owner = b.color === me ? 'your' : `${COLOR_NAMES[b.color]}'s`;
    return join(subject, tpl`is blocked by ${owner} ${PIECE_NAMES[b.type]} on ${sq(blocker)}.`);
  }

  const opp: Color = me === 'w' ? 'b' : 'w';
  if (p.type === 'k') {
    const after = new Chess(chess.fen());
    after.remove(from);
    after.put({ type: 'k', color: me }, to);
    const attackers = after.attackers(to, opp);
    if (attackers.length) {
      const a = after.get(attackers[0])!;
      return join(subject, tpl`can't go to ${sq(to)}: it is covered by ${COLOR_NAMES[opp]}'s ${PIECE_NAMES[a.type]} on ${sq(attackers[0])}.`);
    }
  }

  const kingSq = squaresOf(chess, me, 'k')[0];
  if (chess.inCheck() && kingSq) {
    const checkers = chess.attackers(kingSq, opp);
    const c = checkers[0] ? chess.get(checkers[0]) : undefined;
    const by = c ? tpl` from the ${PIECE_NAMES[c.type]} on ${sq(checkers[0])}` : { text: '', speech: '' };
    return join(tpl`You are in check`, by, { text: ', and that move does not stop it.', speech: ', and that move does not stop it.' });
  }

  if (kingSq && p.type !== 'k') {
    const without = new Chess(chess.fen());
    without.remove(from);
    const pinners = without.attackers(kingSq, opp).filter((s) => !chess.attackers(kingSq, opp).includes(s));
    if (pinners.length) {
      const pin = chess.get(pinners[0])!;
      return join(subject, tpl`is pinned to your king by ${COLOR_NAMES[opp]}'s ${PIECE_NAMES[pin.type]} on ${sq(pinners[0])}.`);
    }
  }
  return join(subject, tpl`can't go to ${sq(to)}.`);
}

function explainCastle(chess: Chess, side: 'k' | 'q' | 'either', history: Move[]): Line {
  const me = chess.turn();
  const opp: Color = me === 'w' ? 'b' : 'w';
  const rights = chess.getCastlingRights(me);
  const sides: ('k' | 'q')[] = side === 'either' ? ['k', 'q'] : [side];
  const sideName = (s: 'k' | 'q') => (s === 'k' ? 'kingside' : 'queenside');
  const homeRank = me === 'w' ? '1' : '8';

  const reasons: Line[] = [];
  for (const s of sides) {
    const has = s === 'k' ? rights.k : rights.q;
    if (!has) {
      const kingMove = history.find((m) => m.color === me && m.piece === 'k');
      if (kingMove) {
        reasons.push(tpl`You can't castle: your king moved on move ${String(moveNumber(history, kingMove))}.`);
        break;
      }
      const rookHome = ((s === 'k' ? 'h' : 'a') + homeRank) as Square;
      const rookMove = history.find((m) => m.color === me && m.piece === 'r' && m.from === rookHome);
      const rookTaken = history.find((m) => m.color === opp && m.to === rookHome && m.captured === 'r');
      if (rookMove) reasons.push(tpl`You can't castle ${sideName(s)}: your rook left ${sq(rookHome)} on move ${String(moveNumber(history, rookMove))}.`);
      else if (rookTaken) reasons.push(tpl`You can't castle ${sideName(s)}: your rook on ${sq(rookHome)} was captured on move ${String(moveNumber(history, rookTaken))}.`);
      else reasons.push({ text: `You can't castle ${sideName(s)} any more.`, speech: `You can't castle ${sideName(s)} any more.` });
      continue;
    }
    if (chess.inCheck()) { reasons.push({ text: "You can't castle while in check.", speech: "You can't castle while in check." }); break; }
    const path = (s === 'k' ? ['f', 'g'] : ['d', 'c', 'b']).map((f) => (f + homeRank) as Square);
    const blocker = path.find((x) => chess.get(x));
    if (blocker) {
      const b = chess.get(blocker)!;
      reasons.push(tpl`You can't castle ${sideName(s)}: your ${PIECE_NAMES[b.type]} on ${sq(blocker)} is in the way.`);
      continue;
    }
    const crossing = path.slice(0, 2).find((x) => chess.isAttacked(x, opp));
    if (crossing) {
      const a = chess.attackers(crossing, opp)[0];
      const ap = chess.get(a)!;
      reasons.push(tpl`You can't castle ${sideName(s)}: ${sq(crossing)} is attacked by ${COLOR_NAMES[opp]}'s ${PIECE_NAMES[ap.type]} on ${sq(a)}.`);
      continue;
    }
    reasons.push({ text: `You can't castle ${sideName(s)} right now.`, speech: `You can't castle ${sideName(s)} right now.` });
  }
  return join(...reasons);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const file = (s: string) => s.charCodeAt(0) - 97;
const rank = (s: string) => Number(s[1]) - 1;
const toSq = (f: number, r: number) => (String.fromCharCode(97 + f) + (r + 1)) as Square;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Could this piece type go from -> to on an empty board? (Ignores castling.) */
export function reachesOnEmptyBoard(piece: PieceSymbol, color: Color, from: string, to: string): boolean {
  const df = file(to) - file(from);
  const dr = rank(to) - rank(from);
  const ax = Math.abs(df);
  const ay = Math.abs(dr);
  if (ax === 0 && ay === 0) return false;
  switch (piece) {
    case 'n': return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    case 'b': return ax === ay;
    case 'r': return ax === 0 || ay === 0;
    case 'q': return ax === ay || ax === 0 || ay === 0;
    case 'k': return ax <= 1 && ay <= 1;
    case 'p': {
      const dir = color === 'w' ? 1 : -1;
      const start = color === 'w' ? 1 : 6;
      if (ax === 0) return dr === dir || (dr === 2 * dir && rank(from) === start);
      return ax === 1 && dr === dir;
    }
  }
}

/** Squares strictly between two squares on a line (empty for knight jumps). */
function between(from: string, to: string): Square[] {
  const df = Math.sign(file(to) - file(from));
  const dr = Math.sign(rank(to) - rank(from));
  const ax = Math.abs(file(to) - file(from));
  const ay = Math.abs(rank(to) - rank(from));
  if (!(ax === ay || ax === 0 || ay === 0)) return [];
  const out: Square[] = [];
  let f = file(from) + df;
  let r = rank(from) + dr;
  while (f !== file(to) || r !== rank(to)) {
    out.push(toSq(f, r));
    f += df;
    r += dr;
  }
  return out;
}

export function squaresOf(chess: Chess, color: Color, piece: PieceSymbol): Square[] {
  const out: Square[] = [];
  for (const row of chess.board()) for (const c of row) if (c && c.color === color && c.type === piece) out.push(c.square);
  return out;
}

function moveNumber(history: Move[], m: Move): number {
  const idx = history.indexOf(m);
  const startTurn = history[0]?.color ?? 'w';
  const ply = idx + (startTurn === 'b' ? 1 : 0);
  const startFull = Number((history[0]?.before ?? '').split(' ')[5] || 1);
  return startFull + Math.floor(ply / 2);
}

function listSquares(squares: Square[]): Line {
  const parts = squares.map((s) => tpl`${sq(s)}`);
  if (parts.length === 1) return parts[0];
  const last = parts.pop()!;
  return join({ text: parts.map((p) => p.text).join(', '), speech: parts.map((p) => p.speech).join(', ') }, 'and', last);
}
