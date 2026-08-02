# Little RPG

A browser idle auto-battler built for a phone held upright. The hero walks a
straight line on its own, runs into monsters, kills them without input and
clears stages. All you decide is where the gold goes.

The layout follows the three bands from the original sketch: **UI** on top,
**Fight** in the middle, and a tabbed panel below with **Upgrades**,
**Skills**, **Forge** and **Prestige**.

```
+------------------------------+
| < Stage 7 >         gold /s  |  UI
+------------------------------+
|      hero ---->  monster     |  Fight
|  scrolling ground, parallax  |
+------------------------------+
| Upgrades | Skills | Prestige |  tabs
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
- **Idle** progress banks half your gold per second while the game is closed or
  the tab is hidden, up to 8 hours.
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

### The four tabs

1. **Upgrades**: stats bought with **gold**, wiped on rebirth.
2. **Skills**: two trees behind one switch at the top.
   - *Skills*, paid with **level points** (one per level). Wiped on rebirth,
     and you can respec at any time.
   - *Relics*, the prestige tree, paid with **relics**. Permanent.
   - In both, a node only opens once the previous one in its branch has a point.
3. **Forge**: only appears after the first rebirth.
4. **Prestige**: rebirth. Wipes stage, gold, upgrades, level and skill points,
   and turns the depth of the run into relics. The first one lands at stage 25;
   since the formula is cumulative minus what you already collected, repeating
   the same depth does not pay twice.

The relic tree has six branches: **Power**, **Wealth**, **Essence**,
**Automation**, **Skills** and **Time**, 1,498 relics to fill completely.

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
styles.css          UI (buttons and frames are 9-sliced Mini Medieval art)
src/
  main.js           bootstrap plus the game loop (fixed 1/60 s step)
  format.js         1.2K, 340M, 5.07aa...
  data/
    balance.js      EVERY progression number, the file to rebalance
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
