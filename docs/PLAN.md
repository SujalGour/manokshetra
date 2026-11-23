# Manokshetra (मनोक्षेत्र) — Build Plan

> *Manokshetre Chaturange…* — On the battlefield of the mind, the game begins.

**Manokshetra** ("battlefield of the mind") is a voice-first blindfold chess trainer.
You speak your moves, the bot replies out loud, and the narrator **Sanjaya** — who
described the Kurukshetra war to the blind king Dhritarashtra — tells you about a
battle you cannot see. When you slip, it explains *what you lost track of*.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Chess rules (source of truth) | chess.js |
| Engine | Stockfish (WASM, Web Worker) |
| Speech-to-text | Browser speech recognition → later Vosk/Whisper WASM |
| Text-to-speech | Browser speech synthesis (Sanjaya's voice) |
| Board UI (peek / review) | chessground or react-chessboard |
| Storage | IndexedDB (Dexie) |
| Installable / offline | PWA (vite-plugin-pwa) |
| Tests | Vitest + Playwright |
| Hosting | GitHub Pages via GitHub Actions |

No backend at all: everything runs in the browser.

## 2. Architecture

```
Mic ─► Recognizer ─► Move parser ─► Game controller ─► chess.js (truth)
                     (matches legal       │
                      moves only)         ├─► Illegal-move explainer
                                          ├─► Stockfish worker (bot move, eval, blunders)
                                          ├─► Question handler ("where is my queen?")
                                          └─► Sanjaya (TTS) ─► Headphones
                              Stats / progress ─► IndexedDB
```

```
src/
  speech/   recognizer.ts, sanjaya.ts (TTS + phrasing)
  parser/   moveParser.ts, commandParser.ts
  game/     controller.ts
  coach/    illegalExplainer.ts, blunderCheck.ts, hints.ts
  engine/   stockfish.ts
  daily/    dailyChallenge.ts, share.ts
  drills/   ...
  store/    ...
  ui/       Home, Game, Daily, Review, Drills, Stats, Settings
tests/      parser corpus, explainer cases, e2e
```

## 3. Features by phase

### Phase 1 — MVP: playable blindfold game
- [x] New game: color, bot strength, voice speed
- [x] Push-to-talk (space / big button) and hands-free mode (mic muted while Sanjaya speaks)
- [x] Move parser matched only against legal moves: SAN, spoken forms ("knight to f3",
      "knight takes e5"), "horse", "castle short/long", promotions, NATO letters
      ("bravo five"), fuzzy matching over recognizer alternatives, "did you mean…?"
- [x] Optional confirmation ("Knight f3, correct?")
- [x] Sanjaya announces bot moves in natural speech ("Bishop takes on c6, check.")
- [x] Illegal move detection (short reply) + "why?" for an explanation
- [x] Hidden board + **Divyachakshu** (peek) button, counted
- [x] Game end: mate, stalemate, repetition, 50-move rule, resign, draw
- [x] Keyboard input fallback
- [x] Deploy to GitHub Pages

### Phase 2 — Coach
- [ ] Illegal-move diagnosis: piece not there / moved earlier, path blocked, pinned,
      in check, piece captured, own piece on square, castling rights
- [ ] Questions (count as peeks): where is my X, what's on e5, what attacks f7,
      am I in check, material, repeat last move / last N moves / whole game, read position
- [ ] Blunder warning: off / warn after move / allow take-back
- [ ] Graded hints ("look at your knight" → "knight to g5")
- [ ] Undo (optional, counts against score)

### Phase 3 — Daily challenge ("Today's Yuddha")
- [ ] One position per day, the same for everyone, picked deterministically from the date
      (no server needed: curated list + date-seeded index)
- [ ] Sanjaya reads the position aloud; you solve or play it out blindfold
- [ ] Scoring: solved?, peeks, illegal attempts, time
- [ ] Wordle-style share card, copied to clipboard, no spoilers:
      ```
      ♞ Manokshetra #42 — Solved
      👁 0 peeks · ✗ 3 illegal · ⏱ 2:14
      🟩🟩🟥🟩🟩 🔥 streak 7
      ```
- [ ] Streak tracking and a countdown to the next challenge
- [ ] One attempt per day (practice mode afterwards)

### Phase 4 — Training path
- [ ] Visibility levels: full board → blank discs → flash every N moves → last move only → audio only
- [ ] Starting positions by difficulty: K+P endings → minor pieces → simple middlegames → full games;
      custom FEN / PGN / chosen opening
- [ ] Drills: square color, coordinate naming, knight routes, line/diagonal checks,
      listen-and-recall, blindfold puzzles
- [ ] Adaptive difficulty

### Phase 5 — Stats & review
- [ ] Post-game replay with markers for illegal attempts, peeks, questions, blunders, eval
- [ ] Visualization score per game
- [ ] Progress dashboard, weak spots (e.g. "you lose track of bishops")
- [ ] PGN export

### Phase 6 — Polish & extras
- [ ] Human-like bot (Maia via lc0-WASM)
- [ ] Offline recognizer (Vosk/Whisper WASM) for Safari/Firefox and accuracy
- [ ] PWA install, offline, screen wake lock, headphone media keys for push-to-talk
- [ ] Two-player arbiter mode
- [ ] Clocks
- [ ] Accessibility pass

## 4. Quality
- Parser test corpus of hundreds of spoken phrases incl. mis-hearings ("night f3", "bee 5", "see 4")
- Explainer tests for every illegal-move category
- CI: lint, type-check, tests on every push; Pages deploy from `main`

## 5. Risks
| Risk | Mitigation |
|---|---|
| Weak speech recognition in Safari/Firefox | Keyboard fallback; Vosk/Whisper later |
| Mis-hearings | Legal-move-constrained matching, confirmation, "did you mean" |
| Bot too strong / robotic at low levels | Skill level + randomized move choice; Maia later |
| App hears its own voice | Mic muted while Sanjaya speaks |
