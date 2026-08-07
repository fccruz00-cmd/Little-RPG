# Little RPG

A browser idle auto-battler, played with the phone turned sideways. The hero
walks a straight line on its own, runs into monsters, kills them without
input and clears stages. All you decide is where the gold goes.

**Play it**: <https://fccruz00-cmd.github.io/Little-RPG/> — redeployed by
a workflow on every push, so the link always serves the latest build.
`little-rpg.html` at the same address is the whole game in one file, for
playing offline.

The **UI** keeps the top; under it the **Fight** takes a column of its own
and the tabbed panel takes another — **Shop**, **Talents**, **Forge**,
**Skills**, **Pets**, **Ancestors**, **Awaken**, **Ascend** and
**Singularity**: the journey reads left to right, work, friends, the
dead, the awakened trophies, the leap, and the door past every reset.

```
+--------------------------------------------------+
| < Stage 7 >   gold /s   Lv.34  [gems]  xp ====== |  UI
+---------------------------+----------------------+
|    hero ---->  monster    | Shop|Talents|Skills| |  tabs
|  scrolling ground,        +----------------------+
|  parallax, a blood moon   | Damage      Lv.12 221|
|                           | Attack Spd  Lv. 6 181|
|   [ Open the Copper Key ] | Crit Chance Lv. 4  90|
+---------------------------+ Max Health  Lv.18 340|
| dmg/s | health | crit |$| |  ...                 |
+---------------------------+----------------------+
```

(A phone held upright asks you to turn it. See *Layout*.)

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
  runs a 30 s timer. Against mobs and mini bosses, dying only costs the time
  to stand up.
- **Losing a boss holds the stage.** The boss used to respawn on a 1.2 s
  timer, which turned a wall into an unwatchable loop of dying to the same
  boss forever. Now mobs keep coming so the run still earns, and the boss
  waits behind a **Try boss** button in the arena until you say go — or
  until **60 seconds pass**, when it walks back in on its own. The hold
  fixed the watched game and broke the idle one: a player who closed the
  app on a held boss farmed the same stage forever, because nobody was
  there to press the button. Retrying is free either way, so the timer
  only costs an idle run its cadence.
- **Combat** has the hero walk into range, stop, and swing at the pace of the
  Attack Speed stat. Enemies do the same. When the hero falls it gets up in 2 s.
- **Gold** drops from every kill and scales with the stage. Mini bosses pay 5x,
  bosses pay 14x.
- **Hidden tab**: the fight keeps running. See *Running in the background*.
- **&lt; &gt;** step back to a cleared stage to farm it.
- Progress autosaves to `localStorage` every 5 s.

### The roster

Twenty-two mobs and thirteen bosses, in two tiers. The overworld runs to
stage 52; from **stage 64 the line descends into hell** and the second
character pack takes over, ending on the Minotaur at 190.

The two tiers never share a screen. `mobsForStage` only ever shows the **four
most recent unlocks**, so the roster rolls forward instead of accumulating,
and the same rule now governs bosses: `bossesForStage` keeps the five most
recent in rotation and retires the rest. The five overworld bosses all carry
`from: 1`, so the cycle below stage 70 is exactly what it always was.

A boss's `hp` multiplier stays in a narrow band across both tiers, on
purpose. The stage curve already multiplies health by 1.208 a stage and
`BOSS_TIME` is a hard gate, so health that *also* climbed with the tier would
count the same growth twice and dump the second count straight onto the
timer. The hell bosses ramp `dmg` instead, which is threat the player can
answer with health and regen.

### The shop: twelve upgrades, then two more shelves

Eight was what fitted a phone column. A landscape panel shows twelve without
scrolling, and the early game — the part you sit and watch — had nothing left
to spend on after the first hour. Four more, all bought with **gold** and all
wiped on rebirth like the rest:

| upgrade | what it does | cap |
|---|---|---|
| **Armor** | less damage taken | 35% |
| **Lifesteal** | heals a share of damage dealt | 10% |
| **Ferocity** | chance to strike twice | 20% |
| **Insight** | XP multiplier — levels faster, so the talent tree fills faster | x3 |

**Every one of them is capped, and that is load-bearing.** Only `damage`,
`maxHp` and `regen` are allowed to run without a ceiling, because they are
the rails that track the stage curve; anything else uncapped compounds
against them and the hero one-shots the world around stage 25. These four sit
low and finish early on purpose, which is what makes them answers to the
early game rather than four more late-game rails.

Two of them share a bonus key with a talent node, so `GameState` sums the
shop level and the tree bonus in one getter (`state.lifesteal`,
`state.doubleHit`) and `battle.js` reads *those*. Reading `bonus.x` directly
would have silently ignored the shop level the moment the tree granted the
same thing. (Barbs joined that club later: `state.thorns` sums the shop
level with the Thorns keystone.)

The shop then went quiet exactly when the player had the most gold
multipliers to spend, so two more shelves open with the reset layers
(`gate` in `balance.js`, enforced in `bulkFor` so a locked stat cannot be
bought even by script). **Six with the first rebirth:**

| upgrade | what it does | cap |
|---|---|---|
| **Giant Slayer** | more damage to bosses and mini bosses | +100% |
| **Barbs** | throws damage taken back (sums with the Thorns keystone) | 24% |
| **Overkill** | excess of a killing blow lands on the next enemy | 50% |
| **Dust Magnet** | more dust chance | +24% |
| **Second Wind** | faster to get up | 40% |
| **War Chest** | more gold from bosses and mini bosses | +120% |

**And three with the first awakening**, allowed to bend combat rules a
little because everything above them already exists:

| upgrade | what it does | cap |
|---|---|---|
| **Ascendant Might** | damage *and* health together | +40% |
| **Reap** | non-bosses below the threshold die outright | 10% |
| **Phoenix Heart** | chance a killing blow leaves you at 30% instead | 30% |

The rebirth shelf honours `awakens` too — `prestiges` resets to zero on an
awakening, and the player who went deepest must not watch six upgrades
vanish. Reap exempts bosses on purpose: their timer *is* the fight, and no
shop row is allowed to shave it. Overkill's carry is floored at 1 hp so a
cascade can never chain-kill on its own.

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
  the machine slept, that span is banked as gold at 50% (100% once the
  Gilded Idol is owned), capped at 8 hours, which is also what happens while
  the game is fully closed. Gold only: there is no fight to read kills,
  experience or dust from.

The catch that made this work at all: gold per second is measured against a
**simulation clock**, not the wall clock. A background wake plays a minute of
fighting in a few milliseconds, and against `performance.now()` that reads as
sixty times the real income, which then inflates every offline payout after
it.

### The nine tabs

1. **Shop**: stats bought with **gold**, wiped on rebirth.
2. **Talents**: three webs behind one switch at the top. All three are the
   same shape — three lanes, links between them — and a node opens because
   something touching it is already yours. See *Every tree is a web*.
   - *Talents*, paid with **level points** (one per level). Wiped on rebirth,
     and you can respec at any time.
   - *Relics*, the prestige web, paid with **relics**. Survives rebirth, and
     an awakening takes it.
   - *Souls*, the awakening web, paid with **souls**. Survives everything.
     The switch only appears once an awakening has paid for it.
3. **Forge**: only appears after the first rebirth.
4. **Skills**: the seven skills behind one switch — Mining, Chopping,
   Fishing and Farming on the line; Smithing at the workshop, Alchemy at
   the cauldron, Cooking at the kitchen.
5. **Pets**: the slime is free, the rest are objectives. See *Pets* below.
6. **Ancestors**: the Hall of Ancestors, open from the first reset ever
   taken and never closed again. Every rebirth — and every awakening —
   leaves behind a **spirit of the hero you were**, and each spirit can be
   assigned **one Shop row** to keep bought, forever: through the rest of
   the run, through rebirth, through awakening. Spirits wake on *lifetime*
   rebirths (a counter nothing resets):

   | spirit | wakes at |
   |---|---:|
   | The Founder | 1 |
   | The Keeper  | 2 |
   | The Blade   | 3 |
   | The Miser   | 5 |
   | The Sage    | 8 |
   | The Warden  | 12 |
   | The Reaper  | 17 |
   | The Eternal | 23 |

   A spirit visits the shop every **8 s** and buys up to its **level** in
   levels of its row; **dust** raises a spirit (40 → 120 → 360 → 1080, to
   level 5), which gives dust something to want besides the forge. An
   assigned board wears its receipt: the row's current shop level and
   what that level pays right now, in the shop's own words. The
   **gold reserve** (0/25/50/75%) is the slice of the purse the whole hall
   must leave untouched, so the spirits never starve a boss build or a
   forge session. Same law as Herald and Anvil: a spirit only does what a
   finger could — the shelf gates hold, capped rows stop at their caps,
   and everything comes out of the one purse.

   The hall also sells the **Ancestral Bounty** (750 → 3,000 → 12,000 →
   48,000 dust, four levels): every gather pays **the same haul again in
   the line's other types**, up to the whole line in one swing at level
   four — work a pine and the oak comes along, then the ash. It reaches
   *up* while the tool allows and falls back down after, because the dead
   widen your hands but cannot sharpen your axe. The blessing is a rule of
   gathering itself, so the Cosmos' planets work with blessed hands too.
7. **Awaken**: only appears after the first awakening, and carries the
   awakening's own trophies behind one switch.

   The first catalog is the **Bestiary**: every kill counted under the
   name of what died, lifetime, through every reset, thirty-five species
   across mobs and bosses. Each **notch**, one per power of ten past the
   species' base (100 kills for a mob, 10 for a boss), pays **+6% damage
   against that species**, up to ten notches. Kills tally from minute
   one; the grudge only folds once awakened, like the Omniscience marks.

   The second is the **Jewels**: four stones cut with **souls**, three
   facets each, and every facet reaches all four gathering lines at once.
   Haste shortens the swing (the third cut makes it instant, to the
   minimum-swing floor), Plenty adds up to +60% yield, Springs sets
   nodes up to 45% closer, Study adds up to +90% skill XP. Pure quality
   of life by design: gathering never pays damage, so its jewels never
   touch the fight. Awakening also unlocks the **pet armor** bench on
   the Forge tab: fitting a wild thing for a piece is singularity
   knowledge.

8. **Ascend**: the two reset layers behind one switch.
   - *Rebirth* wipes stage, gold, upgrades, level and skill points, and turns
     the depth of the run into relics. The first one lands at stage 25; since
     the formula is cumulative minus what you already collected, repeating
     the same depth does not pay twice. The **Relic Echo** lifts every
     payout by a quarter of its base per rebirth already taken this cycle,
     so rebirth number six pays real relics at depths number one had
     already milked dry; awakening resets the echo with the counter. The pane also keeps the **sprint**:
     the deepest stage inside a run's first 30 minutes of game time — a
     personal time-trial with no server behind it, because "how fast does my
     build open" is the question each rebirth actually answers.
   - *Awaken* is the layer above: it wipes everything Rebirth wipes **plus
     relics, the relic tree, rebirths, dust and gear**, and pays **souls**.
     Souls are measured against every relic the ascension earned, from all
     three sources: banked by past rebirths, still pending in the current
     run, and paid by dungeon clears. The first soul lands at 50 relics.
     Souls and the soul tree survive every later awakening, as does the
     Skills tab. The **Soul Echo** lifts every payout by half its base per
     awakening already taken, so cycles climb instead of repeating, and
     the two uncapped rails at the ends of the soul lanes (Transcendence
     and Undying, +12% damage or health a rank at ever-steeper cost) make
     sure a soul never arrives with nowhere to go.
9. **Singularity**: the strip's last tab, opened by the **ceremony** of
   the same name on the Ascend tab: a door, not a wipe. It asks for three
   lifetime awakenings, opens once, forever, and what it opens is the sky
   and nothing else. The first two catalogs share the telescope — the **Planetarium** and the **Constellations** — drawn as
   sideways-scrolling rows of card portraits joined O → O → O, sharing
   **one telescope**: an hour spent charting The Sword is an hour Jupiter
   is not being found, and that is the whole decision. Observation runs on
   game time (the speed toggle turns the sky faster), partial progress is
   kept per body, and every discovery is permanent — it survives rebirth
   *and* awakening. Each of the eight planets automates one thing you were
   doing by hand:

   | body | hours | automates |
   |---|---:|---|
   | Luna    | 0.3 | fishing runs in the background |
   | Mercury | 0.75 | claims finished contracts |
   | Venus   | 1.5 | farming runs in the background |
   | Mars    | 2.5 | mining runs in the background |
   | Jupiter | 4   | chopping runs in the background |
   | Saturn  | 6   | re-brews a lapsing potion |
   | Uranus  | 9   | re-plates a lapsing dish |
   | Neptune | 13  | feeds the walking companion on its own |

   A gathering planet pays one full node per 15 s tick on its line and
   skips the line your tool is on — roughly a third of working it by
   hand, so the tool slot keeps its weight. Bench planets only do what a
   finger could: Saturn and Uranus top up only effects **you** set going,
   and nothing happens when the materials are not there. The endgame
   automates the early friction, the same bargain Herald, Anvil and
   Forager already made.

   The tab's third catalog is **Omniscience**: one ledger row per
   countable pile in the game — the five currencies plus every raw and
   refined resource, forty-five rows. Each row tallies the **lifetime
   total** of that thing ever gained, and the tally only climbs:
   spending, feeding, rebirth and awakening take nothing back, the
   number grows with natural play and asks for no decisions. (The first
   cut counted the most ever *held* at once, greenstack-style; alpha
   killed it in a day because it turned every fish into a feed-the-pet
   or fatten-the-score dilemma.) Tallies pay in **marks**, one per power
   of ten past the row's base, and every mark is a small permanent buff
   of the row's own flavour (ore hits harder, wood moves faster, fish
   keeps you standing, crops pay the mind). Tallies accrue from minute
   one, but the buffs only switch on with the first awakening: the
   ledger is knowledge the road cannot read.

   The **first planet discovered opens the Constellations**: where a
   planet automates, a charted constellation *empowers* — four reach the
   skills and four reach the equipment, all permanent:

   | constellation | hours | grants |
   |---|---:|---|
   | The Sword   | 0.5 | every equipped item +25% stronger |
   | The Plough  | 1   | +20% yield, every gathering skill |
   | The Owl     | 2   | +30% skill XP, every skill |
   | The Anvil   | 3   | +0.5 forge quality (odds up the ladder) |
   | The Chalice | 5   | potions *and* dishes +25% stronger |
   | The River   | 7   | 16% faster work, every gathering skill |
   | The Twins   | 9   | enchants +60% stronger |
   | The Crown   | 12  | the set bonus +60% stronger |

### The talent web

It used to be twelve nodes holding **80 points**, so it filled at level 81 —
and a four-hour run reaches level 92 before the relic tree's +18 free points
are even counted. The tree you touch most, once per level, was the one that
ran out. Every level after that paid nothing.

Making it deeper fixed the ceiling but not the shape: three independent
columns is a shopping list, and every point in it is obvious. It is now a
**web** (`src/data/skilltree.js`) — the small version of what Path of Exile
does, a graph you travel, where a node opens because something *touching* it
is already yours.

```
FURY     ●──●──●──●──●──●──◆        ● node   ○ crossing   ◆ keystone
            │        │
            ○        ○              a crossing costs a point,
            │        │              and carries a stat both lanes want
GUARD    ●──●──●──●──●──●──◆
            │        │
            ○        ○
            │        │
FORTUNE  ●──●──●──●──●──●──◆
```

**25 nodes, 204 points.** Three things follow from the shape, and they are the
whole design:

1. **You pick a door.** All three lane heads are open from the first point, so
   the first thing the game asks is what kind of hero this run is.
2. **Crossing costs.** The link between lanes is a *node*, not a free edge, so
   splitting your points is a real price rather than a shrug — and the four
   crossings carry hybrid stats, so the price buys something.
3. **The end of a lane is earned.** A **keystone** does not open until the node
   before it is **full**, not merely started. It costs a committed lane rather
   than a spare point, and it buys something that changes how a fight goes
   instead of how big a number is.

| lane | keystone | what it does |
|---|---|---|
| **Fury** | Frenzy | +attack speed per kill in a streak, up to 15 — and the streak dies with you |
| **Guard** | Thorns | throws a share of the damage you take back at whatever hit you |
| **Fortune** | Treasure | a chance for any kill to pay double gold |

Frenzy is capped on purpose. An uncapped streak would hand you an unbounded
multiplier for parking on a stage you had already outgrown, which is the
opposite of a reward for pushing. Thorns is measured off the damage that
*actually landed*, so armour and Carapace cut what comes back as well as what
goes in — off the raw hit, the tankiest build would be paid most for being
hit hardest, which is backwards.

### Every tree is a web

The same silhouette runs through all ten trees in the game — talents,
relics, souls, and one per skill. `web.js` holds the machinery
and `skilltree.js` holds nothing but topology; a node's data (`max`, `cost`,
`key`, `mode`, `per`) stays in the file that owns its tree, so there is one
place to change what a node *does*.

Three lanes and not four is a layout fact, not a taste: the panel gives a tree
about 200px of height on the phone this game is built for, and five rows of
node is exactly what fits. What differs between the webs is how much a link
costs.

| web | shape | crossing |
|---|---|---|
| **Talents** | 3 × 7, 25 nodes, 204 points | four nodes, and keystones at the ends |
| **Relics** | 3 × 7ish, 24 nodes | Veteran, Respite, Forager, Anvil — the four things every build wants |
| **Souls** | 3 × 4, 16 nodes | Menagerie and Harvest *became* the crossings: pets and gathering sit between the pillars |
| **Mining / Chopping / Fishing / Smithing** | 3 × 4, 12 nodes | none — the lanes link directly |

The six relic branches became three lanes, and the two-node soul branches
became crossings, because a lane you can only reach through another lane is
what makes a web a web. Nothing was renamed: **node ids are save keys**, and
every id the old columns used is still there.

That relayout does mean a node that used to be a *branch head* — Herald,
Respite, Pack Leader, Green Thumb — now sits in the middle of somebody else's
lane. So `webUnlocked` opens a node you have **already bought**, always. Without
that, an old save would keep its points and its bonus but be unable to add to
them, which reads as the game eating a purchase. It cannot be exploited: the
*first* point in a node still needs a path to it.

Keystones stayed out of the prestige webs on purpose. Making an existing node
demand a *full* neighbour would lock points people had already spent.

Coordinates are grid units, not pixels, and the track weights (`cols()`,
`ROW_H`) drive **both** the CSS grid and the SVG wire endpoints. That is the
only reason a wire lands on a node centre from a 190px panel to a 620px one —
put a track size in the stylesheet instead and the two halves drift apart.

The **shop** is not a web and should not be: its upgrades are repeatable
purchases on a gold curve with no prerequisites *between them* — the two
gated shelves gate on the reset layers, not on each other. A graph needs
something to gate.

Three things live outside the tabs entirely, all in the HUD:

- The **gem purse**, beside your level. Tapping it opens the gem shop, where
  gems are *spent*. Neither the purse nor the shop appears until a dungeon
  has paid you a gem. See *Gems* below.
- The **pouch**, top right. The one place in the game that asks for money.
  It is always there — a control that exists only on some builds is one
  nobody learns — and what it opens depends: a shelf of gem packs when a real
  app store answered, and a plain *this copy sells nothing* when none did,
  which is exactly what a browser build should say to somebody who tapped a
  shop.
- The **gear**, beside it. Options: sound, music, damage numbers, language,
  export and import.

The two shops are deliberately separate. One spends a currency you earned;
the other sells it. Putting them behind one button would have made the second
look like part of the first.

### The soul tree

Souls are roughly an order of magnitude scarcer than relics: one at 50 relics
earned, seven at 260, seventeen at 500. So the tree is short, expensive and
made only of things the relic tree cannot reach. Three lanes and four
crossings:

| lane | what it buys |
|---|---|
| **Ascendant** | Soulfire (+40% damage a rank), Rend, Annihilate, Cataclysm |
| **Eternity**  | Memory (start +3 stages), Bloodline, Aegis, Eternal Hour |
| **Dominion**  | Avarice (+45% gold a rank), Epiphany, Hoard, Conquest |
| *crossings*   | Pack Leader and Keeper's Table (pets), Green Thumb and Quick Hands (gathering) |

A point costs `node cost + ranks already in it`, the same ramp as relics; the
nodes are shallower instead, because souls arrive in ones and twos. The whole
tree is about 226 souls, which is many awakenings deep on purpose.

**Paths.** Before paths, the second ascension was the first one again,
faster. Each awakening now grants **one free choice** of a build lens on the
Awaken pane — real tradeoffs, folded like any other bonus source:

| path | grants |
|---|---|
| **Berserker** | +25% damage, +15% attack speed, **−20% health** |
| **Sentinel** | +30% health, +30% regen, +10% thorns, **−10% damage** |
| **Plunderer** | +30% gold, +15% XP, +10% dust chance, **−10% damage** |

The choice is spent when you pick and returned by the next awakening —
without that rule the picker is a free stat toggle you flip before every
boss, which is a chore pretending to be a choice. Saves that had already
awakened when paths shipped get their pick on load.

### Pets

Twenty-two companions. The slime is with you from the start; the other
twenty-one are locked behind **objectives, one per pillar of the game**, so
the collection doubles as a tour of the systems. Objectives are checked
against live state every tick, a tame lands the moment it is earned, and
nothing ever comes undone: an old save walks out of load with everything it
already qualifies for.

**Every tamed pet's buff is active at once** — the choice never moved into
a slot. What did move is the road: **one pet, your pick, walks beside the
hero** (the `follow` button on any tamed row), drawn from the enemy
roster's own sheets at pet scale. Twenty-two of them was a traffic jam
that buried the fight; the buffs never left, the parade just stopped
being one.

| pet | tamed by | eats | buff per level |
|---|---|---|---|
| Pocket Slime   | with you from the start   | Minnows  | +4% health |
| Belfry Bat     | Mining level 10           | Carp     | +1.5% attack speed |
| Little Watcher | first rebirth             | Salmon   | +0.4% crit chance |
| Hellpup        | clearing any dungeon      | Trout    | +4% damage |
| Cinder Slime   | first awakening           | Sturgeon | +5% gold |
| Bone Buddy     | falling in battle 25 times| Minnows  | +6% regeneration |
| Wisp           | Fishing level 15          | Carp     | +3% XP |
| Bloodling      | a blood moon clear        | Trout    | +0.2% lifesteal |
| Ember Golem    | forging a legendary       | Salmon   | +4% dust |
| Imp            | reaching stage 100        | Sturgeon | +0.4% to strike twice |
| Ash Bat        | Chopping level 15         | Carp     | +2% stride |
| Urchin         | Farming level 15          | Carp     | +1.2% thorns |
| Honey Bear     | plating 25 dishes         | Minnows  | +1.2% yield, all skills |
| Clot           | 150 boss kills            | Trout    | -0.6% damage taken |
| The Doorman    | claiming 30 contracts     | Sturgeon | +4% on the first hit |
| Hedge Wizard   | charting 4 Cosmos bodies  | Carp     | +1% work speed, all skills |
| Minotaur Calf  | the deepest dungeon tier  | Trout    | +0.5s on the boss timer |
| Auntie Imp     | 100 pet feedings          | Minnows  | pets eat 2% less |
| Grudge         | wearing a Tier III enchant| Salmon   | +0.03 crit damage |
| Moon Pup       | 5 Bloodmoon clears        | Salmon   | 3% faster to get up |
| Grave Tutor    | rolling 10 Legendaries    | Sturgeon | +0.4% dust chance |
| Greedling      | waking 3 ancestors        | Sturgeon | +0.8% double-gold kills |

**Two rules hold the roster together**, and they are worth keeping if it
grows again. No two pets carry the same bonus key, so a pet is never a
smaller copy of another one; and the sprite must be a mob or boss the loader
already fetches (`allActorIds`), or the pet is invisible in both the parade
and its own row. Both are asserted in the tests.

Everything after the first five sits at about two thirds of their `per`
values. Twenty-two pets should be a wider collection than five, not four
times the power — and Pack Leader, on the soul web, multiplies all of them.
The third dozen's objectives point at everything built since the first ten
(enchants, contracts, the Cosmos, the kitchen, the Bloodmoon, the Hall of
Ancestors), and they sit a real distance out on purpose: the collection was
filling up faster than the game could grow.


Levels are bought with **raw fish of the pet's own tier**, and the
refinery's reserve guarantees the larder: meals only ever cook from the
surplus, so the feed is always there when the button is. Meals always cook
from the best fish first, so the lower tiers pile up as dead stock the moment
a better pool opens; pets are what that surplus is for, and the geometric
cost curve (5 fish, times 1.32 a level) is the only cap. Like everything the
gathering economy touches, pets and their levels survive **rebirth and
awakening both**.

Every pet also owns exactly **one piece of armor**, shaped to the body
that wears it: a **Gel Helm** because a jelly has nowhere to hang a
cuirass, **Oven Mitts** for Auntie Imp, a **Furnace Door** for the
golem's chest, **Greeting Gauntlets** for the Doorman's handshake.
Five rises per piece, **forged on the Forge tab** where the bars live,
keys-style with the bill on the row, paid in bars and planks (tier N in
tier-N materials, from 20 bars and 12 planks up to 108 and 68). Each
rise multiplies **that pet's own buff** by another +25%, x2.25 fully
dressed, and the pet's card on the Pets tab wears the result. One fitted piece instead of a wardrobe keeps it a deepening of
the pet you already love, not a second gear system, and it makes the
parade the smith's last, longest customer. Like the tame itself, the
piece is bolted on for good: it survives rebirth and awakening.

### Options and languages

The footer's **options** opens the game's one modal: sound effects, music,
damage numbers, language, and the save export/import. The list scrolls, so
it stays usable on a short phone. The save travels as a **file** (plus the
clipboard when the browser allows it) and comes back through a real
textarea with a file picker; the first version used `window.prompt`, which
Android webviews swallow whole and phone clipboards truncate, and it died
in alpha as "import does not work".

**Portuguese and English.** The English string IS the key: display sites
call `t('...')`, English falls through untouched, and a missing entry shows
English rather than a blank, so a forgotten string is cosmetic and never a
broken screen. Proper nouns stay English in both languages on purpose:
Soulfire, Hellpup, the Templar and the Time Draught are names, not
sentences. Switching language saves and reloads, because every string is
read as the world is built, and a rebuild is cleaner than re-translating a
live DOM.

### Sound, champions and the road

- **Sound** is synthesized in WebAudio: no samples, no files, no licences.
  Hits, crits, coins, jingles, the boss horn, all of it oscillators. The
  toggle lives in the footer and rapid effects are throttled per name.
- **Music** is generative, not a loop: a slow chord pad wandering a small
  progression under sparse pentatonic notes at loose random intervals, so
  it never repeats exactly. The key follows the descent (A minor in the
  overworld, D minor over hell, cold near-drones in the depths), it pauses
  in hidden tabs, and its own footer toggle rides a fade, not a cut.
- **Champions**: one mob in ~40 arrives tinted and named. GILDED pays 5x
  gold, SOULBOUND always drops dust (only spawns once the forge exists),
  FLEET is frail, fast and worth three kills of experience.
- **The road**: some stages carry something on it, rolled on genuine stage
  entry only, never on reload. A **chest** (a pile of gold, sometimes dust);
  a **shrine** (90 free seconds of a random brew); a **merchant** under a
  striped awning, who reforges your weakest slot on the house — same rules
  as the forge, so a bad roll pays a pinch of dust instead of a downgrade,
  and before the forge exists he pays gold; or an **ambushed caravan**,
  whose rescue makes the next five kills pay double gold and double XP.
  All four are hand-pixelled in the renderer, like the gathering nodes.
- **Export/Import save** (gear, top right): the whole save as one line of text,
  for backups and moving between browsers. Garbage and future versions are
  rejected on import.
- **Game speed** (the x1 button, top right): x2 opens with the first
  rebirth, x3 with the first awakening — the resets sell time, and this is
  time. It multiplies the *clock*, not any rate: a wall second simulates 2
  or 3 game seconds in the foreground and in hidden tabs alike, so every
  curve keeps its shape and nothing measured per game second changes. The
  offline payout stays real-time — the toggle speeds up playing, not being
  gone.

### The cauldron, feats and Bloodmoons

- **Cauldron** (Skills tab, the Alchemy switch): three potions, each drinking one line's
  surplus. Time Draught (planks, +20s on every boss clock), Fury Tonic
  (bars, +25% damage), Lucky Brew (dust, +50% gold). Ten minutes each,
  bankable to thirty; prices scale with the deepest material band seen.
  The bench levels **Alchemy**, the fifth skill: every brew pays XP scaled
  to the band it cost, shrines on the road teach a little (the idle trickle
  a brew-only skill would otherwise lack), and its 12-node web reshapes
  every number on this list — potion strength (Potency, up to +120% on the
  effect), duration (Stillroom, up to ~2.6x), price (Reagents, ~45% off),
  the bottle bank (Deep Cellar), a double-pour chance, and longer shrine
  pours (Shrinewise). Same rails as every other skill: level, points, web,
  respec.
- **Feats** (Ascend tab): fourteen lifetime marks, each paying a small
  permanent bonus. The counters never reset, not even on an awakening.
- **Bloodmoon runs**: a dungeon tier you have already cleared can be
  reopened with no regen and double loot. Same key, higher stakes.
- **Boss traits**: from stage 30 every boss fights with one named trick,
  from the Templar's Shield Wall to the Doom Herald's ramping damage.
- **Forge set bonus**: wearing all seven slots at one rarity or better pays
  a bonus keyed to the LOWEST slot, up to +50% damage and health plus
  +25% gold for a full Mythic board.
- **Soul web**: Pack Leader and Keeper's Table amplify pets and cheapen
  their feed, Green Thumb and Quick Hands reach every gathering line at once.
  All four are crossings, so they cost a lane change to reach.

### Skills: seven of them, on one set of rails

Nodes spawn on the same line the hero already walks. It stops, works them,
and moves on, with no input from you. The four gathering skills run on
identical rails, each with its own level, its own ~84 point web and its own
five resources gated by depth (stages 1, 8, 20, 36 and 55). The other three
are benchbound — no line, no tool — and each brings its own furniture to
the pane: Smithing the workshop, Alchemy the cauldron, Cooking the kitchen.

| skill | raw | refined | pays in |
|---|---|---|---|
| Mining   | ore   | bars   | tool heads, and later dungeon keys |
| Chopping | logs  | planks | tool handles |
| Fishing  | fish  | meals  | **Well Fed**: regen and armour |
| Farming  | crops | crates | the kitchen's pantry |
| Smithing | none  | none   | the forge: odds, cost and refining |
| Alchemy  | none  | none   | the cauldron: potion strength, span, price |
| Cooking  | none  | none   | **dishes**: timed yield/gold/XP/stride buffs |

**The refinery runs itself.** Raw becomes refined on its own, a sweep
every few seconds, and the stock list is a ledger, not a bench: nothing
on it takes a tap. It used to be a click per pile, and it died in alpha
as the third complaint about the same fish — a button that quietly turns
pet food into meal stock is a trap, not a decision. Fish are the one
line the refinery treats differently: every pond keeps a raw **reserve**
(a dozen feeds' worth for whoever eats that tier, never less than 30),
so feeding a pet never loses to the kitchen, and only the surplus above
the reserve becomes meals.

**Farming** is the fourth line: plots of tilled earth with the crop poking
out in its own colour, worked in one stop (a crop you had to walk *back*
to would never be harvested by a hero who only walks forward). Crops crate
up the way ore smelts down, and crates are what the kitchen cooks.

**Cooking** is Alchemy's twin at the other bench. A dish is a potion that
grew in the ground — Harvest Stew (+25% yield), Golden Pie (+25% gold),
Trail Rations (+20% stride), Scholar's Jam (+25% XP), ten minutes each,
priced in crates of the deepest band seen. Every effect obeys the
gathering balance rule: economy and pace, never damage. It levels from
cooking, every meal Well Fed eats teaches it a little (the idle trickle
every bench skill needs), and its Hearthfire node reaches across into Well
Fed's regen the way Smithing's Hot Fire reaches every refinery. Icons for
the farm and the kitchen were generated in PixelLab and appended to the
game's icon strip.

**The tool slot is the tradeoff.** You carry one tool, and only the equipped
skill's nodes spawn. Slice 1 measured that stopping to swing costs zero stage
progress, because enemies walk toward you and travel is never the bottleneck,
so gathering needed a real cost and this is it: time on ore is time not on
wood. Equipping is one tap on the Skills tab, and browsing a skill's web
does not change what you are carrying.

**Tools lock the skills together.** Every tool is a head and a handle, so
tier N costs bars *and* planks of tier N-1. No line can be pushed alone, and
you have three tool lines to feed while only ever gathering with one. All
three tool lines cost the same:

| tier | bars | planks | reaches |
|---|---:|---:|---|
| 1 |  30 |  20 | tier 1 resources (stage 8) |
| 2 |  50 |  34 | tier 2 (stage 20) |
| 3 |  75 |  50 | tier 3 (stage 36) |
| 4 | 110 |  74 | tier 4 (stage 55) |
| 5 | 160 | 110 | speed and yield only |

A node your tool cannot work still shows up about a quarter of the time,
greyed with a marker over it, because a node you walk past teaches "upgrade
your tool" better than one that never spawns.

**Well Fed** is Fishing's payout and the one thing that is not a resource.
Meals are eaten on their own, one at a time, and while fed you get more regen
and take less damage, scaled by the tier of the fish. It shows in the HUD
next to your level. It is deliberately never attack: see the balance rule
below.

Everything here, levels, trees, resources and tools, **survives rebirth**.

Two rules hold the whole thing up:

- **Gathering never pays into damage.** Kills produce nodes, so nodes
  producing damage would rebuild exactly the compounding loop the stat caps
  exist to prevent. It pays in access, in conversion, in sustain, and in two
  flat per-node trickles (*Coin Seam*, *Soul Seam*) which are bounded by the
  kill rate because node rate **is** kill rate.
- **Yield per node is flat within a tier.** Scaling it with stage the way
  gold scales would multiply income sixfold every ten stages and leave every
  sink downstream stale.

*Forager*, on the relic tree, rotates your tool every 60 s so no line stalls
while you are away.

### Dungeons

**Keys** are what the refined pile was for. One per resource tier, forged at
the top of the **Smithing** panel (Skills tab) from bars **and** planks, and
each opens a fixed run of eight rooms. Every room is a mini boss and the last is the boss, at a
difficulty set by the **key**, not by your stage, so a key is a challenge you
choose rather than one the line hands you.

| key | rooms at stage | costs | pays | gems |
|---|---:|---|---|---:|
| Copper  |  26 | 40 bars + 30 planks   | 1 relic, 120 dust | 2 (+10 first) |
| Iron    |  44 | 95 + 70               | 2 relics, 320 dust | 3 (+15 first) |
| Silver  |  64 | 230 + 170             | 4 relics, 850 dust | 5 (+25 first) |
| Gold    |  86 | 550 + 410             | 7 relics, 2.2K dust | 8 (+40 first) |
| Mithril | 112 | 1300 + 980            | 12 relics, 5.6K dust | 12 (+60 first) |

Enter from the button in the arena. **Dying ends the run and the key is
spent** — that is the stake, and without it a key would just be a slow
guarantee. A partial run still pays its share of dust and gold, because
wiping the whole reward on an idle game you were not watching is a bad
trade; relics and gems are the exception and only pay on a full clear.

Measured from stage 25 against the Copper Key: damage level 30 and 45 die,
60 and up clear, in fifteen to twenty seconds. Short, but a run is pass or
fail rather than a grind.

**This is the one place rewards may touch damage.** Everywhere else gathering
pays only in access and conversion, because kills produce nodes and nodes
producing damage rebuilds the compounding loop the stat caps prevent. Here
the loop is broken by the key cost: killing faster fills a key faster, but a
key pays a fixed amount once and the next tier costs about 2.4x the last.
Gold is priced off **your** stage rather than the key's level, since gold is
the one thing here you can already farm.

### Gems, and the shop they open

Gems are the one currency that crosses the whole board: they come out of
dungeon clears and go back in as gold, as time, or as gear. The purse and the
shop behind it are hidden until a run pays the first one, so the shop
introduces itself by handing you something.

The faucet has two taps. **Dungeons**: full clears only, never partial runs,
and the first time a clear takes you deeper than the save ever has pays a
one-off bounty on top — five tiers, 150 bounty gems. **Contracts**: three
dailies and one weekly, pinned above the shop list, worth roughly 10–15 gems
a day. Progress is a *stats delta* against a snapshot taken when the board
rolled, so the lifetime counters do all the bookkeeping and no kill site
changed; the UTC day index deals the board deterministically, so there is
nothing to re-roll by clearing data, and skipping a day by clock forfeits
that day's gems — the exploit priced at exactly what it pays.

| ware | costs | gives |
|---|---:|---|
| Coin Cache   | 20 | an hour of your best gold rate, paid now |
| Hourglass    | 30 | two hours of fight, really simulated, in about half a second |
| Mythic Chest | 60 | your weakest slot reforged **Mythic**, guaranteed |
| Gilded Idol  | 150 | **once, forever**: offline gold at the full rate instead of half |

The game is **free**, and the shop is the only thing that ever asks for
money. Three rules hold it together, and `data/gems.js` exists to keep them:

1. **Every gem is earnable.** The dungeon table above is the whole faucet.
   Nothing is gem-only.
2. **Nothing is exclusive.** The Mythic Chest is the one ware that hands over
   power rather than pace, and the forge rolls Mythic too — rarely, and more
   often the deeper Smithing goes. Gems buy the shortcut, never the
   destination. Relics, souls, feats and pets do not accept gems at all.
3. **Prices are fixed, and every ware says what it gives before you buy it.**
   A price that climbs with what you have already bought, or a box that
   *might* contain the good thing, is how a shop starts hunting the people
   worst at leaving it alone.

The chest also caps its own takings. It targets the **weakest** slot, so it
walks a board up one slot at a time and then refuses: seven purchases is
everything it will ever sell you.

The Idol is the one **permanent** ware, and it stays inside rule 2 on
purpose: it buys pace — the offline discount, lifted for good — never power,
it survives both reset layers, and it sells exactly once. It is the honest
version of the genre's "permanent offer", priced like the long-term purchase
it is.

Awakening wipes gear, Mythic included — the same bargain the Ascend tab has
always offered. Since a Mythic slot may have been paid for, the awaken
confirmation now counts them and says so before the button, and the
erase-everything confirmation names the gem purse outright. Neither changes
what happens; they change whether you found out first.

The Hourglass is the one that does real work: it is not a payout, it runs the
actual battle loop, so it pays in kills, experience, dust, stages, gathering
and every drop along the way, at full rate rather than the offline half. It
is refused inside a dungeon, where two hours would end the run and spend the
rest of the span back on the line.

The Coin Cache is priced off `bestGps`, the best gold/s the save has ever
held, rather than the live rate. The hour after a rebirth is when the live
rate is zero and the ware is most wanted, so pricing off the live rate would
make it worthless exactly then. Bought gold is added straight to the pile and
deliberately kept out of the income window, or the offline payout would come
to believe the hero farms an hour a second.

**On selling gems.** `src/store/billing.js` is the whole of it, and it is the
only code in the game that talks to anything. In a browser it finds no store,
`available` stays false, and the shop never grows a *More gems* section —
which is every build you can open from disk. Inside a Play wrapper it speaks
either the Digital Goods API (a TWA needs no bridge) or a native bridge at
`window.LittleRPGBilling` (Capacitor), loads the store's own localised
prices, and credits through `GameState.redeemPurchase()`.

That method is keyed on the store's purchase token and pays each one exactly
once, which is what makes the required order safe: **pay, credit, save, then
consume**. Consuming can fail, and a purchase that was credited but not
consumed is re-delivered on the next launch for free. The reverse order loses
gems that were paid for.

Prices are never in the repo. The store owns them; it knows the country, the
currency and the tax. See **[docs/PLAY_STORE.md](docs/PLAY_STORE.md)** for
the wrapper choice, the SKUs, and the save-durability problem you have to
solve before selling anything.

### Smithing, and a forge that finally progresses

The forge used to be pure RNG on fixed odds with nothing to improve. Smithing
is what it was missing. It has no nodes and no tool; it levels from the two
things it does: **refining** (which works from stage 1, done by the
automatic refinery as the piles come in) and **forging** (which only opens
after the first rebirth), so it never sits idle.

Its web does three things:

- **Mastery** moves the rarity odds. Each tier's weight is multiplied by
  `(1 + quality)` once per step up the ladder, then normalised. Quality 0
  gives the base odds back exactly, and pushing it moves mass upward without
  any tier ever running past 100%, which a flat "+x% legendary" eventually
  would. Maxed, quality reaches 1.44:

  | | Common | Uncommon | Rare | Epic | Legendary | Mythic |
  |---|---:|---:|---:|---:|---:|---:|
  | base       | 50.0% | 27.0% | 15.5% |  6.0% |  1.5% | 0.02% |
  | quality 1.44 | 14.3% | 18.9% | 26.4% | 25.0% | 15.2% | 0.49% |

  *Standards*, at the end of that branch, raises the **floor**: at three
  ranks the forge simply stops rolling anything below Epic.
- **Anvil** cuts the dust a forge costs and raises what a bad roll refunds.
- **Furnace** cuts raw-per-unit in **every** skill, not just its own. That is
  the one bonus in the game that reaches sideways, and it is why the
  multiplier is applied on top of each skill's own rather than living in
  their webs.

The odds table on the Forge tab is live: it shows what your Smithing is
actually giving you, not the base numbers.

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
| **Mythic (red)**   | 0.02% | **x36** |

**Mythic** is the top of the ladder and the longest chase in the game: about
1 in 5000 from a bare forge, 1 in 200 with Smithing maxed. The Mythic Chest
in the gem shop sells the same item outright, which is the point — a
shortcut is only worth anything while the long way round still exists.

Better than what you wear and it swaps itself in; worse and it turns back into
dust. There is no inventory, because with the value pinned to the rarity the
comparison is trivial and choosing would just be list management. Forging a
slot costs more the better its current item is (10, 20, 34, 55, 90, 150, 250),
so chasing the top is expensive on purpose.

The **Automation** branch buys upgrades for you (*Herald*) and forges for you
(*Anvil*); the **Skills** branch adds double strikes, lifesteal, extra damage
against wounded targets and a bonus on the first hit.

**Enchants.** A Rare-or-better roll also carries one small affix — Keen
(crit), Gilded (gold), Wise (XP), Hungry (lifesteal), Dusty (dust) or Swift
(attack speed), at tier I/II/III (55/30/15) — and a bench on the Forge tab
rerolls it for about 60% of that slot's forge price. Rarity is a ladder you
climb once; an enchant is a slot you argue with, which is the decision the
forge was missing and a dust sink that outlives a full board. The affix
belongs to the *item*: a new piece brings its own or none, the Mythic Chest
rolls one too, and the values are a fraction of a rarity step so a lucky
affix never beats an unlucky rarity — orange still always beats purple.

### Levels and experience

Every kill grants XP (mini boss x5, boss x12) and every level grants one skill
point. Levelling does not touch a stat on its own; the web is where the power
comes from, otherwise it would be one more hidden curve. Filling the whole web
costs 204 points, which a single run does not reach — you spend a run choosing
a shape, not completing a checklist. *Veteran*, on the relic tree, adds extra
points that survive rebirth.

## Leaderboards

Three leagues, split by how the save was funded, so nobody competes against
a wallet: **Patron** (real money was ever spent), **Gilded** (no money, but
gems bought *power* — a Mythic Chest or the Gilded Idol) and **Pure** (at
most pace was bought; the Coin Cache and Hourglass do not count). The
league only hardens — pure → gilded → patron, never back — and survives
every reset; `spendTier` in `state.js` is the classifier, fed by lifetime
counters that seed from what an old save can prove.

Each league ranks two boards: the **weekly sprint** (deepest stage inside a
run's first 30 minutes, keyed to the UTC week) and the all-time **best
stage**. The trophy button in the HUD only exists when a backend is
configured in `src/net/config.js` (a Supabase project URL and anon key —
both public by design); unconfigured builds make **zero network calls**.
`supabase/schema.sql` is the whole server: one table readable by anyone,
writable only through one function that clamps, keeps maxima, hardens
leagues and refuses more than one write per row per 20 s.

The trust model, honestly: this is a fully client-side idle game, so a
score is a **claim, not a proof** — the server's manners make vandalism
inconvenient, not impossible. Names pass a courtesy filter on both ends;
submissions queue offline and flush on the next boot; boards read from a
local cache when the network is away.

## Layout

**Little RPG is a landscape game.** Turned sideways, the HUD keeps the full
width and everything under it becomes two columns: the arena and the stat
readout on the left, the whole tabbed panel on the right. The panel stops
competing with the arena for height, which is the entire point — on an
844x390 phone it goes from **212px tall to 340**, and from 460px wide to 490.

Before the rework, `#app` was capped at 460px and centred, so the same phone
spent **45% of its screen on black bars** and showed one and a half shop
rows; a 1180px tablet wasted 61%.

The one rule that makes it work is that **the canvas keeps a wide box**
(`aspect-ratio: 4/3`), rather than filling a tall column. The renderer
derives its zoom from canvas *height*, so a tall narrow canvas zooms in and
the visible stretch of road shrinks — the enemy stops walking in and starts
arriving mid-swing. Pinning the box wide keeps the world within ~10% of the
portrait numbers the game was balanced against (117x88 at scale 3, against
portrait's 130x84 at 3), and the space left under it is where the action
buttons live: off the game world, and low enough to reach one-handed.

**Under 480px of height — every landscape phone — the panel goes on a
diet.** Every 9-sliced control drops its frame scale from 2x to 1x (same
art, half the border), and the tree panes invert their scrolling: instead
of the web peering through an 88px porthole under a stack of pinned bars,
the **pane scrolls as one column** and the web gets a 300px window — the
whole tree, readable, with the parchment detail strip pinned sticky so a
tapped node still explains itself. The stock and workshop stop being
scrollers of their own, so it is one finger, one direction. The tab row
scrolls sideways when nine tabs outgrow a narrow panel, rather than
clipping the last two off the screen.

**With height to spare, the arena becomes a band instead.** From a 640px-tall
viewport up — tablets, small desktop windows — the two columns give way to the
shape the game is drawn for: a strip of world across the top, big sky and a
blood moon, with the panel spread underneath.

That threshold is not a taste call. The band is `38vh` tall and the zoom is
`round(height / 92)`, so the zoom holds at 3 only while `38vh >= 230px` —
which is exactly 640. One pixel under, the zoom drops to 2, the visible road
doubles, and the hero is an ant in a field. Measured across the switch:
`639px -> 139 world units @3`, `640px -> 333 @3`. The framing changes; the
sprite size does not.

A phone in landscape is 375-430px tall, so it always gets the columns — a
band there would be a 140px strip with one row of shop under it.

**And past 1280px wide the columns come back**, for the opposite reason. A
band is the right answer while width is the thing in short supply; once there
is 1920px of it, splitting gives the fight a 996px column and the panel a
922px one, and both are bigger than either gets stacked. So there are three
shapes, and each threshold is the point where the previous one stops paying:

| | shape | why |
|---|---|---|
| under 640px tall | columns | no room for a band without dropping the zoom |
| 640 tall, under 1280 wide | band, arena a 2.2:1 window in it | height to spare, width in short supply |
| 1280 wide and up | columns | enough width that both halves get a real one |

**A wide band needed a window, not a wider camera.** The zoom comes from
canvas *height*, so a band stretched edge to edge on a 1920px screen showed
**480 units of road** — four times a phone's — and since `heroAnchor` is
`1 - WALK_IN / worldWidth`, 91 units of 480 put the hero at 0.81, clamped to
0.78: near the right edge with a thousand pixels of ground nobody walks on
behind him.

Zooming in fixes the framing and bills the other two things on the screen for
it: band height is what buys the zoom, so a centred hero meant **doubled
sprites and a panel squeezed to a strip**. It was built, measured and
reverted. What works is narrowing the **box** — `.arena` is
`aspect-ratio: 2.2 / 1`, centred, with the cabinet's wood either side and a
bevel around it. The ratio is arithmetic: worldWidth is worldHeight times the
canvas ratio and the zoom holds worldHeight near 92, so 2.2 is ~200 units of
road and stands the hero at 0.55, with the zoom untouched and the panel whole.

It also closed a leak that predated it. The 0.78 clamp is what kept the hero
on screen, and past ~420 units of road it quietly stopped the gap being
`WALK_IN` as well: 106 units at 1920 wide, **141 at 2560**, against 91
wherever the anchor is free. A 2560px screen was earning **54 kills in four
simulated minutes against a phone's 66**. Freeing the anchor put every screen
back on 91, and that one back to 65.

**The parallax fills the sky it is given.** Its heights were literals — 46
units of far hill over a 72-unit ground line — which is two thirds of a
phone's sky and a fifth of a 1440p column's, so a tall arena was mostly empty
gradient. They are fractions of `groundY` now, floored at the phone's values
so nothing ever gets *less* scenery than the art was drawn with. Height
scales; horizontal spacing does not — scaling the tree span too thinned the
treeline out, because the same one-in-three filter over a longer stride is
half the trees across the same stretch of road.

**The HUD grows, and that part stayed.** Every size in it was picked for a
390px phone, where 48px of wood carrying two rows is a tenth of the screen;
on a 1080p monitor the same 48px are a twentieth and the row that runs the
game reads as trim. From `900x700` up the type and the experience bar scale
(68px of HUD, 20px gold) while the wood, the frames and the pixel art stay
exactly what they were. Icons step 16 -> 24 and not 16 -> 20, because the
sheet is 16px a cell and 1.5x is the step the rest of the game already uses.

**And the world moves a screen pixel at a time.** Positions used to round to
whole *world* units, so the scenery only moved on the frames where it had
accumulated a whole one: **50 distinct screen positions over 120 frames**, on
every screen, including the phone. It reads as a stutter and it is not one —
the fight is running at 60. `Renderer.q()` rounds to DEVICE pixels
(`dpr x scale`) instead, which is 87 positions over the same 120 frames, and
it costs no sharpness: a snapped origin still lands on a whole device pixel
and each source pixel still covers exactly `dpr x scale` of them.

The gate is `(min-width: 560px) and (min-aspect-ratio: 1/1)` — not
`orientation: landscape`, which fires on a 600x500 desktop window that has no
room for two columns. Pane internals switch on a **container query** against
the panel itself, because once the arena takes 42% the viewport width stops
meaning anything to them: the shop, forge, pets and feats go to two columns
at 470px of panel and three at 820px. The webs do not switch at all: they
are three lanes at every width, and only the cell size changes.

**Portrait still works** and is still the whole original stylesheet. A phone
held upright gets a "turn your phone sideways" prompt; a narrow *desktop*
window does not, because you cannot rotate a monitor — the test is
`pointer: coarse`, not width.


```
index.html          the shell: HUD, arena column, tabbed panel
styles.css          UI: every frame, strip and bar is 9-sliced pack art
src/
  main.js           bootstrap, the game loop (fixed 1/60 s step) and the
                    background loop that runs it while the tab is hidden
  format.js         1.2K, 340M, 5.07aa...
  data/
    balance.js      EVERY progression number, the file to rebalance
    gathering.js    the four skills: resources, tools, trees, Well Fed
    dungeon.js      keys, rooms and what a run pays
    gems.js         the gem faucet, the shop, and the rules both obey
    enemies.js      roster, when each mob unlocks, bosses
    upgrades.js     what shows up in the shop
    levels.js       XP curve and gain per kill
    talents.js      all three trees (nodes, effects, costs)
    gear.js         forge: slots, rarities, odds and costs
    prestige.js     what a run is worth in relics, and a cycle in souls
    ancestors.js    the hall: spirits, wake thresholds, rise costs
    sprites.js      GENERATED, frame counts and body box per sprite
  engine/
    loader.js       image loading
    anim.js         spritesheet player
  game/
    state.js        derived stats, trees, level, forge, ascension, save/load
    battle.js       arena simulation (knows nothing about canvas or DOM)
    render.js       canvas: procedural scenery, sprites, bars, numbers
  store/billing.js  Play Billing, the only code that talks to anything
  ui/ui.js          HUD, tabs, shop, trees, forge and ascension panel
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
for any character in the `ROSTER`.

`GROUND_LINE` in `sprites.js` is **57**, and that number is easy to get wrong.
`bottom` in the manifest comes from Pillow's `getbbox()`, whose bottom edge is
**exclusive**, so `bottom: 57` means the last row holding any pixels is 56.
Reading it as inclusive parks every sprite two world pixels above the floor,
and the scale transform multiplies that, so a boss at 1.45x floated by three. Worth knowing: the **Soldier** is the only
model in the pack shipping with a shadow painted into the sprite, even in the
"no shadows" folder, and it clashes with the shadow the game draws.

### The interface

There is no flat CSS chrome: every panel, strip, node and bar is a sprite
from the Mini Medieval pack, 9-sliced so it scales without blurring. The
whole vocabulary is sixteen crops:

| sprite | slice | where it goes |
|---|---|---|
| `board` | `6 6 7 6`, no fill | every card: stat plaques, forge slots, ascension facts, boss timer, toast |
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
  "<character pack 01>/Characters(100x100 split)" \
  "<character pack 02>/Characters(100x100 split)" \
  "<Mini-Medieval-User-Interface-8x8>" \
  "<Raven Fantasy Icons>/Full Spritesheet/32x32.png"
```

The roster lives in the `ROSTER` dict and the icons in the `ICONS` list, both
at the top of that script. Each roster entry says which pack it comes from.
The two character packs share the 100x100 frame and the same ground line, so
they stand on one line without anyone floating: pack 02's grounded sprites sit
at rows 56-59, inside the 57-61 spread pack 01 already had.

## Privacy

The game has no servers and makes no network requests. Progress lives in one
`localStorage` entry on your own device and is never transmitted. See
[PRIVACY.md](PRIVACY.md) for the full policy, including what the store
handles when someone buys the game.

## Asset credits

The game uses crops from four third-party packs:

- **Tiny RPG Character Asset Pack 01**, the overworld roster
- **Tiny RPG Character Asset Pack 02** (20 characters), the hell roster
- **Mini Medieval User Interface v1.1** by [VEXED](https://v3x3d.itch.io/),
  buttons and frames
- **Premium - Raven Fantasy Icons**, upgrade and item icons

The eight farm-and-kitchen icons (seedling, hoe, crate, cookpot, stew, pie,
rations, jam — cells 39–46 of the icon strip), the nine night-sky icons
(the eight bodies plus the telescope — cells 47–55) and the eight
constellation charts (cells 56–63) were generated with
[PixelLab](https://pixellab.ai) on this project's own account and carry no
third-party redistribution question.

None of the four ships a licence file. The icon pack in particular is sold as
a paid product, and licences like that usually allow use in a game but
**forbid redistributing the raw art**, which is exactly what versioning
`assets/` in a public repository does. If you publish this, check the terms of
each pack. If they cannot ship along, put `assets/characters/`, `assets/ui/`
and `assets/icons/` in `.gitignore` and have everyone run
`tools/extract_assets.py` against the original packs.
