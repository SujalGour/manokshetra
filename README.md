# Manokshetra (मनोक्षेत्र)

*Manokshetre Chaturange…* — on the battlefield of the mind, the game begins.

Manokshetra is a voice-first **blindfold chess trainer**. You speak your moves, the
opponent (Stockfish) replies out loud, and the narrator **Sanjaya** — who described the
Kurukshetra war to the blind king Dhritarashtra — tells you about a battle you cannot see.
When you try an illegal move, say **"why"** and Sanjaya explains what you lost track of.

**Play:** https://sujalgour.github.io/manokshetra/ (Chrome or Edge for voice input)

## What works now (Phase 1)
- Speak moves: "e4", "knight f3", "bishop takes c6", "castle kingside", "e8 queen",
  NATO letters ("bravo five"), "knight b d2" / "knight from b1 to d2"
- Hold-to-talk (button or space bar) or hands-free listening
- Sanjaya reads every move aloud; voice and speed are adjustable
- Illegal move detection, with explanations on "why" (blocked path, pinned piece,
  piece that moved away earlier, castling rights, own piece on the square)
- "Did you mean…?" and "Which one?" when a move is unclear
- **Divyachakshu**: peek at the board for a few seconds (counted)
- Commands: repeat, why, peek, help, resign; typed input as a fallback
- 8 opponent levels (Padati → Chakravartin), runs fully in the browser

See [docs/PLAN.md](docs/PLAN.md) for the roadmap.

## Develop
```bash
npm install
npm run dev      # http://localhost:5173/manokshetra/
npm test         # parser, explainer and game-flow tests
npm run build
```
