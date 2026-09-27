# Ethlabs — 15 s motion piece

Source: ethlabs.org (home, thesis, funding), fetched 2026-09-27.
1920×1080, 60 fps, 15.0 s = 8 bars at 128 BPM (beat 0.46875 s, bar 1.875 s). Deterministic: `window.seek(t)`.

## Idea
One hairline runs through the whole film. Everything is built from the site's own primitives
(rule, bowl, triangle, circle — plus the red of JOIN@ETHLABS.ORG) and everything *settles* on the line.
The film ends by rebuilding the ethlabs.org homepage, then resolving into the logo.

## Design system
- Palette from the site: `#fff` paper, `#111` ink hairlines, `#8f8f8c` muted, one red `#e5392b` = value.
- Type: Outfit (variable) — 600 display, 300 text, tracked uppercase labels. Wordmark = the site's SVG paths.
- The line is a real damped string: every landing (dot, letters, logo dot) plucks it; the soundtrack plucks with it.

## Score
| bar | t (s) | scene |
|---|---|---|
| 1 | 0–1.9 | Point → line (ruler ticks). Red dot drops, plucks the string. |
| 2 | 1.9–2.8 | *We believe **credible neutrality** matters.* Line → balance beam on a fulcrum, two weights, settles level (0.00°). |
| 2 | 2.8–3.8 | ***ETH*** — fulcrum flips into the octahedron, spins, lands on the favicon silhouette. |
| 3 | 3.8–4.7 | ***DeFi*** — chevron arms become asymptotes, rotate into axes: x·y = k, a swap slides down the curve. |
| 3 | 4.7–5.6 | ***adoption*** — the dot doubles on every 16th: 1 → 512. |
| 4 | 5.6–7.5 | Drop. Dots rain onto the line; *The settlement layer* falls letter by letter and settles; red dot = full stop. |
| 5 | 7.5–9.4 | The line bends into a ring (*…of the global economy*), becomes a globe; red settlement arcs. Dive into the red node. |
| 6 | 9.4–11.3 | Full red → pull back: *One node in a much larger network.* |
| 7 | 11.3–13.1 | The network shrinks into the homepage's CONTRIBUTORS circle; ethlabs.org rebuilds itself. |
| 8 | 13.1–15 | Everything retracts to the logo; the red dot lands on the line one last time. ETHLABS.ORG. |

## Build
`./render-all.sh` (~15 s) → `out/ethlabs.mp4` (master, CRF 14), `out/ethlabs-web.mp4` (CRF 21), `out/poster.png`.
Pipeline: page exports its sync events (`window.SYNC` → `out/sync.json`: 512 raindrops, 18 letters, 103 nodes…) →
`synth.mjs` writes `out/audio.wav` → 10 headless-Chrome chunks render in parallel (12–24 motion-blur sub-frames) → concat + mux.
Encode converts RGB→YUV with the BT.709 matrix (untagged 601 conversion shifts the brand red to orange).
QA: `./sheet.sh` (2×2), `./sheet16.sh` (4×4), `./strip.sh t0 dt` (30), `./strip12.sh t0 dt` (12, timestamped),
`./qa.sh t…` (16 frames decoded from the final MP4), `node render.mjs eval 'expr'`. Preview: open `index.html` (`?t=6.2` = one frame).
