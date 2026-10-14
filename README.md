# Cosmic Treasure Hunt: an interactive browser game

A multi-page browser game I built from scratch with HTML, CSS and vanilla JavaScript, with no frameworks, game engines or libraries. Players unlock a sequence of themed "treasure" pages, each with its own mini-game or puzzle, and progress ends in a boss fight and an animated finale.

**Live:** <https://vxentino.neocities.org>

## Technical highlights

- **Canvas boss fight** ([`site/secret3/duel.js`](site/secret3/duel.js), ~520 lines). A real-time bullet-hell duel on `<canvas>`, driven by a `requestAnimationFrame` loop with a clamped delta time. The boss has a three-phase state machine and cycles attack patterns (rings, sweeps, homing shots, spirals). The player can parry, which clears nearby bullets and damages the boss only while its core is open. Rendering is DPR-aware and includes screen shake and a chromatic-flash effect.
- **Synthesized audio.** Sound effects are generated at runtime with the Web Audio API (oscillators, gain envelopes, and a dynamics-compressor limiter on the master bus) instead of being loaded as files. The audio context resumes on the first user gesture to satisfy browser autoplay rules.
- **Sequence-memory game** ([`site/secret2.html`](site/secret2.html)). A Simon-style game where each round adds one note to the sequence, with synthesized tones and error feedback.
- **Procedural visuals.** Starfields, a matrix-style rain effect, bokeh, petals, and butterflies on Bézier-curve paths, each drawn on its own canvas layer and resized to the viewport.
- **Persistent progress.** Unlocked treasures and settings such as music on/off are saved in `localStorage`, so progress survives page reloads.
- **Scripted cutscenes.** A warp-tunnel transition, a moon cutscene, and an animated ending sequence, all sequenced with timers and CSS transitions.

## Structure

```
site/
├── index.html           # hub: password gate, progress, links to treasures
├── treasure1-4.html     # themed puzzle/mini-game pages
├── secret1-2.html       # bonus pages ("Kitty Follower", sequence memory game)
├── secret3/             # boss duel: secrets3.html, duel.js, duel.css
├── final.html           # ending: animated finale
└── *.gif / *.png / *.jpg
```

Each page is self-contained, with its own inline styles and scripts, which keeps pages independent but duplicates some helpers (resize handling, audio tones). Pulling the shared pieces into common modules is the main cleanup I'd do next.

## Running locally

No build step is needed. Serve the folder with any static server:

```bash
cd site
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening the files directly also works, but some browsers restrict audio and storage on `file://` URLs.

## What I learned

- Structuring a game loop around delta time, so movement speed doesn't depend on frame rate
- Building effects and audio from primitives instead of relying on assets
- Managing state across pages without a backend

## Next steps

- Extract shared utilities (canvas sizing, tones, storage helpers) into ES modules
- Self-host the background music instead of linking to files in other repositories
- Add keyboard and touch alternatives for every interaction

## License

MIT. See [LICENSE](LICENSE).
