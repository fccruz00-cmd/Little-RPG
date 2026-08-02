# Little RPG

A browser idle auto-battler built for a phone held upright. The hero walks a
straight line on its own, runs into monsters, kills them without input and
clears stages. All you decide is where the gold goes.

The layout follows the three bands from the original sketch: **UI** on top,
**Fight** in the middle, and a tabbed panel below with **Upgrades**,
**Talents**, **Skills**, **Forge** and **Prestige**.

```
+------------------------------+
| < Stage 7 >         gold /s  |  UI
+------------------------------+
|      hero ---->  monster     |  Fight
|  scrolling ground, parallax  |
+------------------------------+
| Upgrades | Talents | Skills |  tabs
|  Damage           Lv. 12 221 |
|  Attack Speed     Lv.  6 181 |
+------------------------------+
```

## Running it

**Fastest way:** download `little-rpg.html` and open it with two clicks. That
is the whole game in one file, CSS, code and sprites inlined, no server and no
folder beside it. Saved progress works too.

**To work on the code:** serve the folder, because the game uses ES modules and
`index.html` will not open straight from `file://`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

After changing anything, regenerate the single file:

```sh
python3 tools/build_single_file.py
```

## How it plays

- **Stages** hold 10 mobs plus a **final encounter**: a mini boss on regular
  stages, a **boss** every 5. Both walk in larger than the mobs; the boss also
  runs a 30 s timer, and letting it expire or dying to it hands the boss its
  health back. Against mobs and mini bosses, dying only costs the time to
  stand up.
- **Combat** has the hero walk into range, stop, and swing at the pace of the
  Attack Speed stat. Enemies do the same. When the hero falls it gets up in 2 s.
- **Gold** drops from every kill and scales with the stage. Mini bosses pay 5x,
  bosses pay 14x.
- **Hidden tab**: the fight keeps running. See *Running in the background*.
- **&lt; &gt;** step back to a cleared stage to farm it.
- Progress autosaves to `localStorage` every 5 s.

### Reading the screen

- **Gold** is the big number up top, with gold per second under it.
- The **stat strip** above the shop shows damage/s, health, crit and the gold
  multiplier without opening anything.
- An upgrade you cannot afford yet shows a **progress bar behind the row**. A
  grey row only saying "no" does not tell you whether that is one second away
  or two minutes.
- A **star** marks the upgrade with the best power per coin among the ones you
  can afford.

### Running in the background

Switching tabs does not pause the game. `requestAnimationFrame` stops the
moment the tab is hidden, so a timer takes over and fast-forwards the fight
instead: real kills, real stages, real experience, real soul dust, and Herald
and Anvil keep working. Come back and you get one line telling you what
happened, like `+2.4M gold, +12 stages over 3h 12m`.

Three details make it hold together:

- **Browsers throttle background timers**, to once a second and then to once a
  minute after five minutes. That is fine, because each wake simulates the
  whole span since the last one rather than a fixed step. Stepping costs
  about 0.07 ms per simulated second with no renderer attached, so ten
  minutes of catch-up is roughly 40 ms.
- **A visible tab can be starved too.** A window sitting behind another gets
  its frames throttled without ever firing `visibilitychange`, so a frame gap
  longer than 250 ms is caught up the same way instead of being clamped away.
- **Anything nobody simulated still pays.** If the browser froze the tab or
  the machine slept, that span is banked as gold at 50%, capped at 8 hours,
  which is also what happens while the game is fully closed. Gold only:
  there is no fight to read kills, experience or dust from.

The catch that made this work at all: gold per second is measured against a
**simulation clock**, not the wall clock. A background wake plays a minute of
fighting in a few milliseconds, and against `performance.now()` that reads as
sixty times the real income, which then inflates every offline payout after
it.

### The five tabs

1. **Upgrades**: stats bought with **gold**, wiped on rebirth.
2. **Talents**: two trees behind one switch at the top.
   - *Talents*, paid with **level points** (one per level). Wiped on rebirth,
     and you can respec at any time.
   - *Relics*, the prestige tree, paid with **relics**. Permanent.
   - In both, a node only opens once the previous one in its branch has a point.
3. **Skills**: gathering. **Mining** today, see below.
4. **Forge**: only appears after the first rebirth.
5. **Prestige**: rebirth. Wipes stage, gold, upgrades, level and skill points,
   and turns the depth of the run into relics. The first one lands at stage 25;
   since the formula is cumulative minus what you already collected, repeating
   the same depth does not pay twice.

The relic tree has six branches: **Power**, **Wealth**, **Essence**,
**Automation**, **Skills** and **Time**, 1,498 relics to fill completely.

### Mining

Ore veins spawn on the same line the hero already walks. It stops, swings,
and picks up ore, with no input from you. Five ores gated by depth (copper,
iron at stage 8, silver at 20, gold at 36, mithril at 55), each smelted into
**bars** at a fixed ore-per-bar rate, and bars buy the next **pickaxe**.

Each pick is paid for in the bars of the ore the previous one unlocked, so
the chain bootstraps: copper buys the pick that reaches iron, iron buys the
pick that reaches silver. A vein your pick cannot handle still shows up about
a quarter of the time, greyed with a marker over it, because a vein you walk
past teaches "upgrade your pick" better than one that never spawns.

Mining has its **own level and its own tree** (84 points across Prospect,
Delve and Refine), fed only by mining XP. All of it, level, tree, ore, bars
and pick, **survives rebirth**.

Two numbers are worth knowing:

- **Mining costs no stage progress.** Measured over ten simulated minutes at
  stages 3, 10, 25, 40 and 60, stopping to swing cost zero stages and within
  3% of the same gold. Travel is never the bottleneck: enemies walk toward
  you, so a swing only changes where you meet them, not when. The real
  tradeoff arrives with the second skill, when one tool slot has to choose
  between a pickaxe, an axe and a rod.
- **Mining never pays into damage.** Kills produce ore, so ore producing
  damage would rebuild exactly the compounding loop the stat caps exist to
  prevent. It pays in access (picks now, dungeon keys later), in conversion
  (bars), and in two flat per-vein trickles, *Coin Seam* and *Soul Seam*,
  which are bounded by the kill rate because vein rate is kill rate.

Bars pile up past what the picks need, on purpose. They are what dungeon keys
will want; until then picks are the only sink.

### Forge and soul dust

After the first rebirth mobs start dropping **soul dust** (20% per regular mob,
always from mini bosses and bosses). Dust forges equipment across seven slots:
sword, helmet, armor, pants, boots, amulet and ring.

Each forge **rolls a rarity**. The stat value is fixed per rarity, the only
randomness is which one comes out:

| rarity | odds | multiplier |
|---|---:|---:|
| Common (white)     | 50.0% | x1 |
| Uncommon (green)   | 27.0% | x2.2 |
| Rare (blue)        | 15.5% | x4.5 |
| Epic (purple)      |  6.0% | x9 |
| Legendary (orange) |  1.5% | x18 |

Better than what you wear and it swaps itself in; worse and it turns back into
dust. There is no inventory, because with the value pinned to the rarity the
comparison is trivial and choosing would just be list management. Forging a
slot costs more the better its current item is (10, 20, 34, 55, 90, 150), so
chasing a legendary is expensive on purpose.

The **Automation** branch buys upgrades for you (*Herald*) and forges for you
(*Anvil*); the **Skills** branch adds double strikes, lifesteal, extra damage
against wounded targets and a bonus on the first hit.

### Levels and experience

Every kill grants XP (mini boss x5, boss x12) and every level grants one skill
point. Levelling does not touch a stat on its own; the tree is where the power
comes from, otherwise it would be one more hidden curve. The whole tree costs
80 points and fills up around stage 120. *Veteran*, on the relic tree, adds
extra points that survive rebirth.

## Layout

```
index.html          the three layout bands
styles.css          UI: every frame, strip and bar is 9-sliced pack art
src/
  main.js           bootstrap, the game loop (fixed 1/60 s step) and the
                    background loop that runs it while the tab is hidden
  format.js         1.2K, 340M, 5.07aa...
  data/
    balance.js      EVERY progression number, the file to rebalance
    mining.js       ores, picks, smelting and the mining tree
    enemies.js      roster, when each mob unlocks, bosses
    upgrades.js     what shows up in the shop
    levels.js       XP curve and gain per kill
    talents.js      both trees (nodes, effects, costs)
    gear.js         forge: slots, rarities, odds and costs
    prestige.js     what a run is worth in relics
    sprites.js      GENERATED, frame counts and body box per sprite
  engine/
    loader.js       image loading
    anim.js         spritesheet player
  game/
    state.js        derived stats, trees, level, forge, prestige, save/load
    battle.js       arena simulation (knows nothing about canvas or DOM)
    render.js       canvas: procedural scenery, sprites, bars, numbers
  ui/ui.js          HUD, tabs, shop, trees, forge and prestige panel
little-rpg.html     GENERATED, the whole game in one file
tools/
  extract_assets.py    crops the source packs down to what the game uses
  build_single_file.py bundles everything into little-rpg.html
```

`battle.js` only emits events (`stage`, `spawn`, `hit`, `kill`, `dust`,
`toast`); drawing and DOM work live in `render.js` and `ui.js`. The whole
renderer could be swapped without touching the simulation.

Tree nodes know nothing about stats: each one accumulates into a bonus key
(`dmgMul`, `goldMul`, `critAdd`...) and `GameState` applies those keys on top
of what gold bought. Adding a talent is one line in `talents.js`, and if the
key already exists nothing else needs to change.

### Rebalancing

Every progression number lives in `src/data/balance.js`. The current curve aims
at this, with the mini boss around 4x a mob and the boss around 10x:

| stage | mob | mini boss | boss |
|------:|----:|----------:|-----:|
|    10 | 1.9 s | 7.2 s | 18.8 s |
|    20 | 2.3 s | 9.1 s | 22.7 s |
|    60 | 0.4 s | 1.5 s |  3.7 s |
|   120 | 0.7 s | 3.4 s |  7.4 s |

The slack in the middle is deliberate: that is when the capped stats (crit,
attack speed, gold) fill up and you steamroll a stretch before the curve
tightens again. Only **Damage**, **Max Health** and **Regeneration** grow
uncapped. If gold gain grew too it would feed itself and the game would go
trivial around stage 25.

Mob attack period (1.25 s) sits below how long they take to die, on purpose. A
mob that never lands a hit is a punching bag and the fight carries no tension.
By simulation that costs about 30 deaths up to stage 20, nearly all of them to
the mini boss, and then you start holding.

The hero is the **Knight**, set by `HERO.id` in `enemies.js`, one line to swap
for any character in the `ROSTER`. Worth knowing: the **Soldier** is the only
model in the pack shipping with a shadow painted into the sprite, even in the
"no shadows" folder, and it clashes with the shadow the game draws.

### The interface

There is no flat CSS chrome: every panel, strip, node and bar is a sprite
from the Mini Medieval pack, 9-sliced so it scales without blurring. The
whole vocabulary is sixteen crops:

| sprite | slice | where it goes |
|---|---|---|
| `board` | `6 6 7 6`, no fill | every card: stat plaques, forge slots, prestige facts, boss timer, toast |
| `button` | `3 3 4 3 fill` | shop rows, tabs, steppers, rebirth. `button_disabled` for off, `button_pressed` for `:active` |
| `frame_gem` / `frame_lit` | `6 6 7 6` | tree nodes, gems dark when empty and lit when maxed |
| `scroll` | `3 5 4 5 fill` | the parchment strip that explains a tab |
| `wood` / `plank` / `plank_tall` | tiled | the wooden shelves the HUD, tabs, headers and footer sit on |
| `bar_track` + `bar_red`/`bar_violet`/`bar_gold` | `1 1 2 1` | XP and stage progress |
| `check_off` / `check_on` | whole | the checkboxes, in place of the browser's |

Two rules keep it from falling apart:

- **The crop has to match the slice.** Each crop is chosen so the middle of
  every edge is a uniform run of pixels. One pixel off and the stretched edge
  smears a bevel down the whole side.
- **Wood always sits under a dark scrim.** The raw plank is a light tan, and
  small cream text on it turns to mud.

The palette in `:root` is sampled straight out of those sprites, so the
colours in the arena, the rarity tints and the borders all come from one
ramp. `render.js` paints the in-arena health bars with the same three tones
as `bar_*.png` by hand: at two to four pixels tall, a 9-slice would land on
half pixels.

### Swapping sprites

`tools/extract_assets.py` crops the source packs, rewrites
`assets/manifest.json`, regenerates `src/data/sprites.js` and patches the
`.ico--*` classes in `styles.css`:

```sh
python3 tools/extract_assets.py \
  "<character pack>/Characters(100x100 split)" \
  "<Mini-Medieval-User-Interface-8x8>" \
  "<Raven Fantasy Icons>/Full Spritesheet/32x32.png"
```

The roster lives in the `ROSTER` dict and the icons in the `ICONS` list, both
at the top of that script.

## Asset credits

The game uses crops from three third-party packs:

- **Tiny RPG Character Asset Pack 01**, characters and animations
- **Mini Medieval User Interface v1.1** by [VEXED](https://v3x3d.itch.io/),
  buttons and frames
- **Premium - Raven Fantasy Icons**, upgrade and item icons

None of the three ships a licence file. The icon pack in particular is sold as
a paid product, and licences like that usually allow use in a game but
**forbid redistributing the raw art**, which is exactly what versioning
`assets/` in a public repository does. If you publish this, check the terms of
each pack. If they cannot ship along, put `assets/characters/`, `assets/ui/`
and `assets/icons/` in `.gitignore` and have everyone run
`tools/extract_assets.py` against the original packs.
