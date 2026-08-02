// Enemy roster. `from` is the stage a mob starts showing up on;
// `hp`/`dmg` are multipliers on top of the stage curve.

export const MOBS = [
  { id: 'slime',               name: 'Slime',            from: 1,  hp: 0.75, dmg: 0.70, speed: 15, reach: 15, hit: 0.55 },
  { id: 'bat',                 name: 'Bat',              from: 1,  hp: 0.55, dmg: 0.85, speed: 34, reach: 14, hit: 0.50, hover: 5 },
  { id: 'orc',                 name: 'Orc',              from: 3,  hp: 1.00, dmg: 1.00, speed: 20, reach: 17, hit: 0.55 },
  { id: 'skeleton',            name: 'Skeleton',         from: 6,  hp: 0.90, dmg: 1.15, speed: 24, reach: 18, hit: 0.55 },
  { id: 'armored_skeleton',    name: 'Armored Skeleton', from: 11, hp: 1.45, dmg: 1.10, speed: 18, reach: 18, hit: 0.60 },
  { id: 'armored_orc',         name: 'Armored Orc',      from: 16, hp: 1.70, dmg: 1.25, speed: 17, reach: 18, hit: 0.60 },
  { id: 'werewolf',            name: 'Werewolf',         from: 22, hp: 1.30, dmg: 1.60, speed: 32, reach: 19, hit: 0.50 },
  { id: 'greatsword_skeleton', name: 'Reaper',           from: 30, hp: 1.80, dmg: 1.45, speed: 19, reach: 22, hit: 0.60 },
  { id: 'elite_orc',           name: 'Elite Orc',        from: 40, hp: 2.10, dmg: 1.60, speed: 20, reach: 20, hit: 0.60 },
  { id: 'werebear',            name: 'Elder Bear',       from: 52, hp: 2.60, dmg: 1.85, speed: 18, reach: 20, hit: 0.60 },
];

// Bosses: one every 5 stages, cycling through the list.
export const BOSSES = [
  { id: 'orc_rider',      name: 'Orc Rider',  hp: 1.00, dmg: 1.6, speed: 16, reach: 22, hit: 0.60 },
  { id: 'knight_templar', name: 'Templar',    hp: 1.15, dmg: 1.5, speed: 15, reach: 21, hit: 0.55 },
  { id: 'swordsman',      name: 'Swordsman',  hp: 1.05, dmg: 1.7, speed: 20, reach: 20, hit: 0.55 },
  { id: 'necromancer',    name: 'Necromancer',hp: 1.25, dmg: 1.8, speed: 13, reach: 24, hit: 0.65 },
  { id: 'wizard',         name: 'Archmage',   hp: 1.35, dmg: 2.0, speed: 14, reach: 24, hit: 0.60 },
];

// The Soldier is the only character in the pack shipping with a shadow baked
// into the sprite, even in the "no shadows" folder, and it clashed with the
// shadow the game draws. Swapping the model fixes it; the Knight is clean.
export const HERO = {
  id: 'knight',
  reach: 19,   // world px at which the hero stops to swing
  hit: 0.5,    // fraction of the attack animation where the hit lands
};

export const BOSS_EVERY = 5;       // one boss every N stages
export const KILLS_PER_STAGE = 10; // regular mobs before the final encounter

/** Mobs available on a stage (the 4 most recent unlocks). */
export function mobsForStage(stage) {
  const unlocked = MOBS.filter((m) => m.from <= stage);
  return unlocked.slice(-4);
}

/**
 * The mini boss closing a regular stage: the beefiest mob unlocked so far, in
 * an oversized version. The list is not strictly increasing (the bat is frail
 * on purpose), so this picks by health multiplier instead of taking the last
 * one, otherwise stage 1 would end on a mini boss bat.
 */
export function eliteForStage(stage) {
  return MOBS.filter((m) => m.from <= stage)
    .reduce((best, m) => (m.hp >= best.hp ? m : best));
}

export function isBossStage(stage) {
  return stage % BOSS_EVERY === 0;
}

export function bossForStage(stage) {
  return BOSSES[(Math.floor(stage / BOSS_EVERY) - 1) % BOSSES.length];
}

/** Every sprite the game might need to load. */
export function allActorIds() {
  return [HERO.id, ...MOBS.map((m) => m.id), ...BOSSES.map((b) => b.id)];
}
