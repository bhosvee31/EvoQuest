# EvoQuest

A browser evolution game. You start as **Plankton**, steer with your cursor, eat
forage off the floor, and climb a ten-step food chain all the way to **Vampire**
while 180 other creatures are trying to eat you first.

The entire game is **one self-contained `index.html`** — no build step, no
bundler, no CDN, no image files, no network calls. Everything (art, audio, AI)
is generated in the browser from code in that file. Double-click it and it
plays.

---

## Play it

**Locally / offline** — open `index.html` in any modern browser. That's it.
There is a link in the bottom bar that saves a fresh copy as `evoquest.html`,
so you can pass the whole game to someone else as one attachment.

**On GitHub Pages** — push this repo and serve it:

1. `git init && git add . && git commit -m "EvoQuest"`
2. Create the repo on GitHub and push.
3. **Settings → Pages → Source: Deploy from a branch**, pick `main` / `root`.
4. Your game is live at `https://<user>.github.io/<repo>/`.

Other static hosts work identically — upload `index.html` to Netlify/Vercel/
Cloudflare Pages/`public_html`, or drop it in an S3 bucket. No configuration
needed.

---

## Controls

| Input | Action |
|---|---|
| Move the mouse | Your creature walks toward the cursor |
| **Hold left mouse** or **hold Spacebar** | Speed boost (drains the boost meter) |
| `C` | Bestiary — every sprite in the game |
| `M` | Mute / unmute |
| `R` | Restart as Plankton |
| `Esc` | Pause |

---

## The rules

**Ten ranks, in order:** Plankton → Fish → Butterfly → Bee → Crab → Sparrow →
Pigeon → Wasp → Owl → Vampire.

**Forage.** Four kinds of floor food (Algae, Berries, Krill, Mushroom). Each is
worth **0.5 XP** and refills your boost meter.

**Evolution.** The XP needed for the *next* rank rises as you climb:

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Name** | Plankton | Fish | Butterfly | Bee | Crab | Sparrow | Pigeon | Wasp | Owl | Vampire |
| **XP to next** | 5 | 7 | 9 | 12 | 15 | 19 | 23 | 28 | 34 | 40 |

So rank 1 needs exactly 5 XP, which is 10 pieces of food. Leftover XP carries
into the new rank. Once you're a Vampire the bar keeps filling as a score.

**Predation.** You can eat any creature of a **lower** rank; any creature of a
**higher** rank can eat you. Equal ranks are harmless to each other. Touching is
instant death for the loser — there is no health bar.

**Killing** a creature transfers **25% of its XP** to you, plus a chunk of boost.

**Dying** costs you nothing but XP: you respawn after ~2.4s keeping **50% of the
XP you had**, at a spot far from anything bigger, with a **2.6s spawn shield**
so you can't be insta-killed on arrival.

**Boost.** The meter holds at most **5 seconds**. Holding the button spends it
at 1× speed ×1.95. It only comes back by eating — 0.45s per piece of forage,
1.75s per kill.

---

## Sprites

All 14 sprites (10 animals + 4 foods) are hand-authored pixel art stored as
character grids in a JSON block inside `index.html`:

```json
"owl": {
  "label": "Owl", "w": 25, "h": 21,
  "pal": { "k": "#2b1d12", "a": "#8a5a2b", "b": "#5c3a17", "w": "#ffffff" },
  "rows": [ ".......k........k.......", "......kak......kak......", ... ]
}
```

Each character is a palette key; `.` is transparent. At boot the game paints
each grid into an offscreen canvas and draws it with nearest-neighbour scaling
(creatures at 3×, forage deliberately one size class smaller at 2× so you can
tell food from animals at a glance).

Press `C` in game to see them all.

### Editing them

`index.html` is generated from `tools/gen-sprites.ps1`, which is the
authoritative source:

```powershell
powershell -ExecutionPolicy Bypass -File tools\gen-sprites.ps1
```

Front-facing sprites are authored as **left halves only** (`L = @(...)`) and the
script appends the mirrored right half, so they cannot come out lopsided.
Side-view sprites are written out in full (`rows = @(...)`). Either way the
script refuses to touch `index.html` if any row length disagrees with the
sprite width or any row uses a palette key that doesn't exist.

`tools/render-sprites.ps1` then draws the whole set to a PNG contact sheet so
you can look at the art without launching a browser:

```powershell
powershell -ExecutionPolicy Bypass -File tools\render-sprites.ps1
```

---

## Development tools

Everything in `tools/` is a development aid and is **not** needed to play or
deploy the game. None of it ships inside `index.html`.

```powershell
# 58 assertions covering the rules, plus a 3-minute simulation soak test
node tools\headless-test.mjs

# render real game frames to PNG (a small software canvas + PNG encoder)
node tools\snapshot.mjs

# render the in-game bestiary panel to PNG
node tools\codex-shot.mjs

# sprite data validation and contact-sheet rendering
powershell -File tools\gen-sprites.ps1
powershell -File tools\render-sprites.ps1
powershell -File tools\sprite-widths.ps1
```

`tools/harness.mjs` boots the game's script inside a stubbed DOM, which is how
both the rule tests and the frame renderers run without a browser. Screenshots
land in your temp directory under `evoquest-shots`.

The game also exposes `window.EvoQuest` (`player`, `critters`, `foods`, `sprites`,
`RANKS`, `addXP`, `kill`, `restart`, `step`) for poking at from the browser
console.

---

## Layout

```
index.html              the entire game
README.md               this file
tools/
  gen-sprites.ps1       sprite source of truth -> writes into index.html
  render-sprites.ps1    sprite contact sheet -> PNG
  sprite-widths.ps1     per-row width audit
  harness.mjs           DOM stub + software canvas + PNG encoder
  headless-test.mjs     rule + soak tests
  snapshot.mjs          render game frames to PNG
  codex-shot.mjs        render the bestiary panel to PNG
```

## Tuning

Every gameplay constant sits in one block at the top of the game script in
`index.html` — world size, population, forage count, sprite zoom, boost
duration and multiplier, XP values, kill/death percentages, respawn timing —
followed by the `RANKS` table. Change a number, reload, done.
