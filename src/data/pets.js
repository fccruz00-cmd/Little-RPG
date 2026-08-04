// Pets: tamed companions that walk beside the hero.
//
// One pet follows you at a time and only that pet's buff applies, the same
// tradeoff the tool slot makes. A pet is tamed automatically the first time
// the line reaches its stage, and taming reads bestStage, so nothing you
// ever tamed can lock itself again after a reset.
//
// Levels are bought with RAW FISH of the pet's own tier. Meals always eat
// the best fish first, so the lower tiers pile up as dead stock the moment
// a better pool opens; pets are what that surplus is for. Feeding, like the
// rest of the gathering economy, survives rebirth and awakening both.
//
// Buffs reuse the talent-node shape ({key, mode, per}) so GameState folds a
// pet with the exact `apply` the trees use. `per` counts full levels: a
// freshly tamed pet is level 1 and already carries one rank of its buff.

export const PETS = [
  {
    id: 'slime', name: 'Pocket Slime', sprite: 'slime', accent: '#6dba79',
    tameStage: 15, fishTier: 0,
    key: 'hpMul', mode: 'mul', per: 0.04,
    blurb: 'a jelly that soaks hits for you',
  },
  {
    id: 'bat', name: 'Belfry Bat', sprite: 'bat', accent: '#5aa9c9',
    tameStage: 40, fishTier: 1,
    key: 'atkSpeedMul', mode: 'mul', per: 0.015,
    blurb: 'sets the pace of your swings',
  },
  {
    id: 'hellpup', name: 'Hellpup', sprite: 'hellhound', accent: '#e67146',
    tameStage: 70, fishTier: 2,
    key: 'dmgMul', mode: 'mul', per: 0.04,
    blurb: 'bites whatever you are hitting',
  },
  {
    id: 'watcher', name: 'Little Watcher', sprite: 'eyeball_monster', accent: '#b072c9',
    tameStage: 100, fishTier: 3,
    key: 'critAdd', mode: 'add', per: 0.004,
    blurb: 'points at the soft spots',
  },
  {
    id: 'cinder', name: 'Cinder Slime', sprite: 'lava_slime', accent: '#ebb85b',
    tameStage: 140, fishTier: 4,
    key: 'goldMul', mode: 'mul', per: 0.05,
    blurb: 'sweats molten pocket change',
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
