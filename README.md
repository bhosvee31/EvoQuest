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

## Multiplayer

The box in the top-right. Type a code and press **Host** or **Join**.

**Architecture: peer-to-peer, host authoritative.** One player hosts the world —
their browser runs the simulation for everyone — and the others connect straight
to them. There is no server, no account and no API key.

This is forced by the deployment target: **GitHub Pages can only serve static
files**, so it cannot run a game server. The host player's machine is the server.

| | |
|---|---|
| Room codes | letters and digits, up to 18 characters |
| Host | runs the world, decides every kill, sees a player count |
| Client | sends its cursor at 20Hz, receives world snapshots at 15Hz |
| Players | ~8 is comfortable; each one is one full world simulation |

**Single-player is completely untouched.** If you never press Host or Join,
nothing is loaded and nothing is sent — the game still runs from `file://` with
no network at all. PeerJS is fetched lazily from a CDN *only* at the moment you
go online, which is the one and only time the game touches the network.

How it stays cheap: the 1300-piece food field and the AI roster are generated
from a **shared random seed**, so both sides build an identical world without
transferring a single coordinate. Only AI positions (a flat number array), other
players, and food removals/respawns travel over the wire.

Rules apply between players exactly as between creatures: eat anything below
your rank, and any higher rank can eat you — including the **0.6s wind-up**
warning and the 50%-of-lifetime-XP death penalty. PvP kills pay **25% of the
victim's lifetime XP** and 60% of your boost meter.

Not built: dedicated servers, accounts, matchmaking, host migration if the host
quits, and lag compensation. The host is trusted — it could cheat.

## Account levels

Alongside the in-game XP there is a second, separate pool: **account XP**. It
belongs to the account rather than to a run, and it is deliberately independent of
the rank ladder:

- It **only ever goes up.** Nothing in the game subtracts from it — not dying, not
  pressing `R`, not merging two profiles, not loading an older save. Dying halves
  your in-game XP and leaves this untouched.
- It **never feeds into ranks.** Levels are their own ladder.
- You earn it by earning in-game XP, at `ACCT_XP_PER_XP` (1:1 by default), so
  both food and kills count.

Leaving level 0 costs **10** account XP. Each level after costs **1.2x** the level
before, **rounded to a whole number at every step**, chained through the rounded
figure:

```
level  0   1   2   3   4   5   6   7   8    9   10
needs   10  12  14  17  20  24  29  35  42   50   60
total   10  22  36  53  73  97 126 161 203  253  313
```

Level 2 is `round(12 * 1.2) = 14`, not `round(10 * 1.2 * 1.2) = 14` — the same
number here, but they drift apart further up, and the rounded value is what the
table chains.

Every level buys **+0.05% food XP**, permanently: level 0 has none, level 1 is
`x1.0005`, level 10 is `x1.005`, level 100 is `x1.05`. The bonus applies to food
only, not to kill payouts, and only to the player — NPCs have no account.

The cap is **level 99999**. That is unreachable in practice, and reaching it is
not a matter of patience: **level 746** costs `1.136e60` — one decillion — and the
levels either side of it cost `9.466e59` and `1.363e60`. The cap itself would cost
around `1e7920`. Since that is far past the largest representable double
(`1.8e308`), thresholds are stored as `log10` of the cumulative total rather than
the total itself, and compared in log space. Consecutive levels differ by about
`0.079` in log10, ten orders of magnitude more than a double needs to tell them
apart.

Below **level 200** the chain is built exactly, one `Math.round` step at a time, so
the "round to a whole number" rule is honoured literally. Above that the rounding
is meaningless against numbers near `1e60`, and a geometric series seeded from the
exact chain takes over.

The seed matters more than it looks. A naive closed form of `10 * 1.2^L` is wrong
by a **constant 3.24%** at every level above ~100, because the rounding is
*chained*: the early round-downs (14.4 → 14) compound, and every later step
inherits the deficit. Level 746 is `1.136e60`, not the `1.173e60` the unrounded
form gives. Seeding from the exact chain at the handover reproduces it to float
precision (`~6e-15` relative).

In practice account XP is a `double`, so the ceiling is whatever a double can hold:
`1e308` XP works out to about **level 3868**. Levels beyond that exist in the table
but cannot be bought, and are reported as maxed rather than as `NaN`.

Because the chain rounds at every step it cannot be closed-form'd with
logarithms, hence the 100,000-entry table — built lazily on first use (~1ms) and
cached.

One judgement call worth flagging: the request was for registered accounts, but
account XP is stored on the profile like everything else, so it also works with no
account at all and syncs to Firestore when you do sign in. Gating it behind sign-in
would have made the whole feature invisible in single-player and from `file://`,
which is the one thing this game does not gate.

## Accounts and saved progress

Progress **always saves to this device**, with no account and no network. Open
`index.html`, play, close it — your rank, XP and stats are still there.

An account is an optional extra that carries that progress to your other
devices. Click **Account** in the top-right.

### Turning accounts on

Accounts are wired up but **switched off**, because they need your own Firebase
project. Five-minute setup:

1. Create a project at <https://console.firebase.google.com> (a Google account is
   enough)
2. **Build -> Authentication -> Get started**, then enable **Email/Password**
   and **Google** under Sign-in providers
3. **Firestore Database -> Create database** (production mode, any region)
4. **Firestore -> Rules**, paste in the [`firestore.rules`](firestore.rules)
   from this repo, and Publish
5. **Project settings -> Your apps -> Web app**, register an app, then copy the
   config into `FB_CONFIG` near the top of the game script in `index.html`:

   ```js
   const FB_CONFIG = {
     apiKey: "AIza...", authDomain: "your-project.firebaseapp.com",
     projectId: "your-project", storageBucket: "your-project.appspot.com",
     messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123"
   };
   ```

6. Reload. **Account: …** appears and sign-in works.

### Checking your setup

```powershell
node tools\check-firebase.mjs    # is FB_CONFIG filled in and does the game still boot?
node tools\rules-lint.mjs        # are the Firestore rules valid Rules-language?
```

Both run offline. `check-firebase` boots the game and reads the real evaluated
config rather than regex-parsing the source, so a syntax error in `FB_CONFIG` is
reported instead of silently killing the whole game script. It expects 2 failures
while the config is still empty — that is the correct "not set up yet" result.

Testing: **do not double-click `index.html`.** A popup sign-in from a `file://`
page fails because the origin is `null`. Serve it instead:

```powershell
python -m http.server 8000     # then open http://localhost:8000
```

`localhost` is already an authorized domain, so Google sign-in works there.
Push to GitHub Pages when you are happy.

Once signed in, verify by looking at **Firestore → Data**: a `profiles`
collection should appear with one document whose ID is your user UID.

While `FB_CONFIG` is empty the sign-in buttons are disabled and the game behaves
exactly as before. The Firebase SDK is only fetched from a CDN when you actually
click sign-in.

### How merging works

If you sign in on a device that already has progress, the two are **merged**
rather than one overwriting the other:

- **Progression** (rank, XP) comes from whichever profile is further along the
  ladder — measured by summing the XP needed to reach that rank and adding what
  is banked toward the next one
- **Counters** (kills, deaths, food, playtime, lifetime XP, account XP) take the
  **larger** value, never the sum, so merging the same device twice changes
  nothing
- **Best times** per rank keep the faster of the two

Merging is deliberately idempotent so that signing in repeatedly can't inflate
your numbers.

### Honest limits

- This is client-side, so **progress is editable**. Anyone can open devtools and
  set their own rank. The Firestore rules block the obvious abuse — you cannot
  touch someone else's document, decrease your own counters, or jump straight to
  Vampire in one write — but they cannot make it impossible. That is the price of
  having no server. Don't build ranked play on top of it.
- If the host of a multiplayer room quits, everyone drops. There is no server to
  take over.
- Auth needs network. Offline play, single player and the profile on disk are
  unaffected.



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

**Killing** a creature transfers **25% of everything it has ever earned** — its
lifetime XP, not just what is sitting in its bar for its current rank — plus
**60% of your boost meter**. Hunting is by far the fastest route to both XP and
a boost burst, and old creatures are worth a lot.

Because a kill pays out of the victim's lifetime total, every creature's total
has to be consistent with the rank it is wearing. NPCs spawn straight into a
weighted rank instead of evolving into it, so they are seeded with the XP their
rank implies (5+7+9+12 = 33 for a Crab, and so on) plus a little progress into
that rank. Otherwise a Crab would carry less XP than a Fish and every kill would
be worth roughly the same. `xpFloor(rank)` in `index.html` is the single place
that arithmetic lives.

That floor is only a *starting* figure. Being eaten costs an NPC half of its
lifetime XP, exactly as it costs you, so a revived Crab is worth less than a
fresh one and repeated kills decay towards worthless (5.6, 2.8, 1.4, 0.7, 0.4,
0.2 XP for six kills in a row) instead of parking one creature as an infinite
source. The floor is deliberately **not** restored on revival: the total is a
real quantity that death destroys, so a creature that has been eaten three times
is legitimately worth less than its rank implies. It recovers the ordinary way,
by eating. This applies at every rank - `reviveCritter` is rank-agnostic - with
the exception of Vampire at rank 9, which has no predator at all, since nothing
eats an equal rank.

**Dying** costs you half of your entire XP estate: your lifetime total *and* the
progress banked toward your current rank are both cut in half. You respawn after
~2.4s far from anything bigger, with a **5s spawn shield** so you can't be
insta-killed on arrival. Your rank is never lost — only the XP behind it.

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
# 98 assertions covering the rules, plus balance simulations
node tools\headless-test.mjs

# 49 assertions: full host/join flow against a stand-in PeerJS
node tools\multiplayer-e2e-test.mjs

# 96 assertions: local profile, tampered-storage sanitising, merge policy,
                        account level maths, cap and overflow safety, monotonicity
node tools\account-test.mjs

# is the Firebase config filled in and does the game still boot?
node tools\check-firebase.mjs

# are the Firestore rules valid Rules-language and do their fields match the game?
node tools\rules-lint.mjs

# measure deaths/progression with and without reacting to warnings
node tools\death-diagnostic.mjs

# check how large creature lifetime XP grows, and what a kill on it pays out
node tools\kill-payout-probe.mjs

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
firestore.rules         Firestore security rules (paste into the console)
tools/
  gen-sprites.ps1       sprite source of truth -> writes into index.html
  render-sprites.ps1    sprite contact sheet -> PNG
  sprite-widths.ps1     per-row width audit
  harness.mjs           DOM stub + software canvas + PNG encoder
  headless-test.mjs     rule, AI and balance tests
  multiplayer-e2e-test.mjs  real host()/join()/wrap() against a fake PeerJS
  account-test.mjs      profile save/load, sanitising, merge policy, account levels
  check-firebase.mjs    is FB_CONFIG filled in and does the game still boot?
  rules-lint.mjs        Firestore rules: Rules-language syntax + field-list match
  death-diagnostic.mjs  deaths/progression measurement over many runs
  kill-payout-probe.mjs creature lifetime XP growth and kill payout scaling
  hunt-payout-probe.mjs what an actual hunt pays out
```

## Tuning

Every gameplay constant sits in one block at the top of the game script in
`index.html` — world size, population, forage count, sprite zoom, boost
duration and multiplier, XP values, kill/death percentages, respawn timing, the
strike windup, and how far above you a creature has to be before it starts
hunting you — followed by the `RANKS` table. Change a number, reload, done.
