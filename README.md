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
| `C` | Guide — rank ladder plus every sprite in the game |
| `M` | Mute / unmute |
| `R` | Restart as Plankton |
| `Esc` | Pause (closes the guide first if it is open) |

## The view

Your creature is **always dead centre** of the screen and the camera never drifts
or clamps, so you always know exactly where you are. There is no minimap and no
permanent rank ladder — the only things on screen are your rank card, a single
one-line tally, and the guide on `C`. Anything outside the world is drawn as dark
void beyond the map border.

If something is coming for you, the game tells you rather than killing you
without warning:

- a **red banner** and a red border on your card name the creature hunting you
- a **red ring pulses** around any predator that is mid-lunge on you
- a **white halo** means your spawn shield is still up

---

## The rules

**Ten ranks, in order:** Plankton → Fish → Butterfly → Bee → Crab → Sparrow →
Pigeon → Wasp → Owl → Vampire.

**Forage.** Four kinds of floor food (Algae, Berries, Krill, Mushroom). Each is
worth **0.2 XP** and tops the boost meter up by **7%** — a piece of forage nudges
the meter, it never fills it. The meter is only ever topped up by grazing, never
by boosting itself.

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

**Killing** a creature transfers **30% of its XP** to you, plus **60% of the
boost meter** — hunting is by far the fastest route to a boost burst.

**Dying** costs you nothing but XP: you respawn after ~2.4s keeping **50% of the
XP you had**, at a spot far from anything bigger, with a **5s spawn shield** so
you can't be insta-killed on arrival.

**Boost.** The meter holds at most **5 seconds**. Holding the button spends it
at 1x speed x2.5. It comes back only by eating: 7% per piece of forage, 60% per
kill.

## Staying alive

A naive build of this is miserable: contact is instant death, so a bigger
creature wandering into you ends the run with no chance to react, and if every
predator beelines for you then a low rank never gets anywhere. Four rules fix
that without weakening the food chain:

1. **Predators wind up first.** Anything above your rank that is touching you
   takes 0.6s to actually swallow you, with a red ring closing in. Break contact
   or boost during that window and it never lands.
2. **Only close ranks come looking.** A creature more than 2 ranks above you will
   never hunt you down - it still eats you on contact, it just won't cross the
   map for you. Anything within 300px is fair game.
3. **Nobody spawns on you.** Respawned creatures always appear at least 900px
   away, and you respawn at least 700px from anything bigger.
4. **Boost always outruns your hunters.** At every rank, boosted speed beats the
   fastest creature allowed to hunt you (there is a test asserting exactly this
   for all ten ranks).

Measured over 3-minute simulated runs, 4 trials each:

| | deaths per run | rank reached |
|---|---|---|
| wanders, boosts on a timer | ~2.8 | ~1.5 |
| reacts to the warning | ~0.5 | ~2.8 |

`node tools\death-diagnostic.mjs` reproduces those numbers, including how much of
each run is spent with an empty boost meter.

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
# 76 assertions covering the rules, plus balance simulations
node tools\headless-test.mjs

# measure deaths-per-run and progression with and without reacting to warnings
node tools\death-diagnostic.mjs

# render real game frames to PNG (a small software canvas + PNG encoder)
node tools\snapshot.mjs

# render the in-game guide panel to PNG
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
  headless-test.mjs     rule, AI and balance tests
  death-diagnostic.mjs  deaths/progression measurement over many runs
  snapshot.mjs          render game frames to PNG
  codex-shot.mjs        render the guide panel to PNG
```

## Tuning

Every gameplay constant sits in one block at the top of the game script in
`index.html` — world size, population, forage count, sprite zoom, boost
duration and multiplier, XP values, kill/death percentages, respawn timing, the
strike windup, and how far above you a creature has to be before it starts
hunting you — followed by the `RANKS` table. Change a number, reload, done.
