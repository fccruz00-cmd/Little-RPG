// Pets: tamed companions that trail behind the hero.
//
// Every tamed pet's buff is on at once; there is no slot and no choice to
// agonise over. The choice lives in the taming instead: each pet after the
// slime is locked behind one of the game's pillars, so the collection
// doubles as a tour of the systems. Taming is checked against live state and
// a tame never comes undone, not even by an awakening.
//
// Levels are bought with RAW FISH of the pet's own tier. Meals always eat
// the best fish first, so the lower tiers pile up as dead stock the moment
// a better pool opens; pets are what that surplus is for. Like the rest of
// the gathering economy, pets and their levels survive every reset layer.
//
// Buffs reuse the talent-node shape ({key, mode, per}) so GameState folds a
// pet with the exact `apply` the trees use. `per` counts full levels: a
// freshly tamed pet is level 1 and already carries one rank of its buff.
//
// `unlock.test` reads the whole GameState. `now`/`need` are optional and
// only feed the "(7/10)" readout on a locked row.

export const PETS = [
  {
    id: 'slime', name: 'Pocket Slime', sprite: 'slime', accent: '#6dba79',
    fishTier: 0,
    key: 'hpMul', mode: 'mul', per: 0.04,
    blurb: 'a jelly that soaks hits for you',
    unlock: { desc: 'with you from the start', test: () => true },
  },
  {
    id: 'bat', name: 'Belfry Bat', sprite: 'bat', accent: '#5aa9c9',
    fishTier: 1,
    key: 'atkSpeedMul', mode: 'mul', per: 0.015,
    blurb: 'sets the pace of your swings',
    unlock: {
      desc: 'reach Mining level 10',
      test: (s) => s.skills.mining.level >= 10,
      now: (s) => s.skills.mining.level, need: 10,
    },
  },
  {
    id: 'watcher', name: 'Little Watcher', sprite: 'eyeball_monster', accent: '#b072c9',
    fishTier: 3,
    key: 'critAdd', mode: 'add', per: 0.004,
    blurb: 'points at the soft spots',
    unlock: {
      // prestiges resets on an awakening, so the veteran path counts too.
      desc: 'rebirth once',
      test: (s) => s.prestiges >= 1 || s.awakens >= 1,
      now: (s) => Math.min(1, s.prestiges + s.awakens), need: 1,
    },
  },
  {
    id: 'hellpup', name: 'Hellpup', sprite: 'hellhound', accent: '#e67146',
    fishTier: 2,
    key: 'dmgMul', mode: 'mul', per: 0.04,
    blurb: 'bites whatever you are hitting',
    unlock: {
      desc: 'clear any dungeon',
      test: (s) => s.deepestKey >= 0,
      now: (s) => (s.deepestKey >= 0 ? 1 : 0), need: 1,
    },
  },
  {
    id: 'cinder', name: 'Cinder Slime', sprite: 'lava_slime', accent: '#ebb85b',
    fishTier: 4,
    key: 'goldMul', mode: 'mul', per: 0.05,
    blurb: 'sweats molten pocket change',
    unlock: {
      desc: 'awaken once',
      test: (s) => s.awakens >= 1,
      now: (s) => Math.min(1, s.awakens), need: 1,
    },
  },

  // --- the second five ---------------------------------------------------
  // Same rule as the first five and it is the whole design: one pillar each,
  // and no two carry the same bonus key. Between them they now point at the
  // three systems the first five did not -- fishing, the forge, and the blood
  // moon -- plus the two events every player has plenty of and no reward for:
  // dying, and pushing past stage 100.
  //
  // Their `per` values sit around two thirds of the first five's on purpose.
  // Ten pets should be a wider collection than five, not twice the power, and
  // Pack Leader multiplies all ten.
  {
    id: 'bones', name: 'Bone Buddy', sprite: 'skeleton', accent: '#d8d4c0',
    fishTier: 0,
    key: 'regenMul', mode: 'mul', per: 0.06,
    blurb: 'keeps picking you back up',
    unlock: {
      // The one counter every idle player runs up without trying, and the
      // only one the game never paid anything for.
      desc: 'fall in battle 25 times',
      test: (s) => s.stats.deaths >= 25,
      now: (s) => s.stats.deaths, need: 25,
    },
  },
  {
    id: 'wisp', name: 'Wisp', sprite: 'ghostfire', accent: '#8fd4ff',
    fishTier: 1,
    key: 'xpMul', mode: 'mul', per: 0.03,
    blurb: 'lights the way to the next level',
    unlock: {
      desc: 'reach Fishing level 15',
      test: (s) => s.skills.fishing.level >= 15,
      now: (s) => s.skills.fishing.level, need: 15,
    },
  },
  {
    id: 'bloodling', name: 'Bloodling', sprite: 'blood_monster_a', accent: '#b74132',
    fishTier: 2,
    key: 'lifesteal', mode: 'add', per: 0.002,
    blurb: 'drinks what you spill',
    unlock: {
      desc: 'clear a blood moon dungeon',
      test: (s) => s.stats.bloodWins >= 1,
      now: (s) => Math.min(1, s.stats.bloodWins), need: 1,
    },
  },
  {
    id: 'ember', name: 'Ember Golem', sprite: 'flame_golem', accent: '#e67146',
    fishTier: 3,
    key: 'dustMul', mode: 'mul', per: 0.04,
    blurb: 'grinds the leftovers back into dust',
    unlock: {
      desc: 'forge a legendary',
      test: (s) => s.stats.legendaries >= 1,
      now: (s) => Math.min(1, s.stats.legendaries), need: 1,
    },
  },
  {
    id: 'imp', name: 'Imp', sprite: 'demon_a', accent: '#c79ae8',
    fishTier: 4,
    key: 'doubleHit', mode: 'add', per: 0.004,
    blurb: 'sneaks in a second swing',
    unlock: {
      desc: 'reach stage 100',
      test: (s) => s.bestStage >= 100,
      now: (s) => s.bestStage, need: 100,
    },
  },
];

export const PET_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p]));

// Feeding cost curve. Geometric like the shop, and steep enough that the
// natural ceiling comes from fish income rather than a hard cap.
export const PET_FEED = { base: 5, growth: 1.32 };

/** Raw fish to take a pet from `level` to `level + 1`. */
export function petFeedCost(level) {
  return Math.ceil(PET_FEED.base * Math.pow(PET_FEED.growth, level - 1));
}
