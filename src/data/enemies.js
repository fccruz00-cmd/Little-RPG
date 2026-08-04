// Enemy roster. `from` is the stage a mob starts showing up on;
// `hp`/`dmg` are multipliers on top of the stage curve.

// The overworld roster runs to stage 52; from 64 the line descends into hell
// and the second pack takes over. The two tiers never mix on screen, because
// `mobsForStage` only ever shows the four most recent unlocks.
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
  // --- hell ---
  { id: 'lava_slime',          name: 'Lava Slime',       from: 64,  hp: 2.30, dmg: 2.10, speed: 14, reach: 16, hit: 0.55 },
  { id: 'hellbat',             name: 'Hellbat',          from: 64,  hp: 1.70, dmg: 2.30, speed: 38, reach: 15, hit: 0.50, hover: 6 },
  { id: 'hellhound',           name: 'Hellhound',        from: 76,  hp: 2.60, dmg: 2.40, speed: 34, reach: 18, hit: 0.50 },
  { id: 'blood_monster_a',     name: 'Gore Fiend',       from: 88,  hp: 3.10, dmg: 2.30, speed: 17, reach: 18, hit: 0.60 },
  { id: 'demon_a',             name: 'Imp',              from: 100, hp: 3.40, dmg: 2.60, speed: 21, reach: 19, hit: 0.55 },
  { id: 'eyeball_monster',     name: 'Watcher',          from: 112, hp: 3.00, dmg: 3.00, speed: 23, reach: 17, hit: 0.55 },
  { id: 'demon_b',             name: 'Brute Demon',      from: 124, hp: 3.80, dmg: 2.80, speed: 20, reach: 19, hit: 0.55 },
  { id: 'ghostfire',           name: 'Ghostfire',        from: 136, hp: 3.20, dmg: 3.40, speed: 32, reach: 16, hit: 0.50, hover: 8 },
  { id: 'flame_golem',         name: 'Flame Golem',      from: 148, hp: 4.80, dmg: 2.90, speed: 13, reach: 21, hit: 0.65 },
  { id: 'demon_c',             name: 'Horned Demon',     from: 160, hp: 4.40, dmg: 3.30, speed: 22, reach: 22, hit: 0.55 },
  { id: 'blood_monster_b',     name: 'Gore Wraith',      from: 175, hp: 4.00, dmg: 3.80, speed: 33, reach: 17, hit: 0.50, hover: 5 },
  { id: 'minotaur',            name: 'Minotaur',         from: 190, hp: 5.60, dmg: 3.80, speed: 18, reach: 22, hit: 0.60 },
];

// Bosses: one every 5 stages. The five overworld bosses cycle from the start;
// the hell bosses join as the line reaches them, and the rotation only ever
// holds the BOSS_POOL most recent, so old bosses retire instead of piling up.
//
// A boss `hp` stays in a narrow band on purpose. The stage curve already
// multiplies health by 1.208 a stage, and BOSS_TIME is a hard gate: health
// that also climbed with the tier would count the same growth twice, and the
// second count lands entirely on the timer. Ramping `dmg` instead puts the
// tier's threat somewhere the player can answer, with health and regen.
// From stage 30 every boss also fights with a TRAIT, one trick each, named
// in its arrival toast. Below 30 they stay plain: the opening stages are
// tuned tight already, and the stretch that needed teeth was 30 through 90,
// where a run used to sail through without a single death.
export const TRAIT_FROM = 30;

export const BOSSES = [
  { id: 'orc_rider',      name: 'Orc Rider',   from: 1,   hp: 1.00, dmg: 1.6, speed: 16, reach: 22, hit: 0.60,
    trait: { kind: 'doublehit', power: 4,    label: 'Rider & Mount' } },   // every 4th swing lands twice
  { id: 'knight_templar', name: 'Templar',     from: 1,   hp: 1.15, dmg: 1.5, speed: 15, reach: 21, hit: 0.55,
    trait: { kind: 'block',     power: 0.25, label: 'Shield Wall' } },     // every 3rd hit does a quarter
  { id: 'swordsman',      name: 'Swordsman',   from: 1,   hp: 1.05, dmg: 1.7, speed: 20, reach: 20, hit: 0.55,
    trait: { kind: 'riposte',   power: 5,    label: 'Riposte' } },         // every 5th hit taken answers
  { id: 'necromancer',    name: 'Necromancer', from: 1,   hp: 1.25, dmg: 1.8, speed: 13, reach: 24, hit: 0.65,
    trait: { kind: 'leech',     power: 0.6,  label: 'Soul Drain' } },      // heals from damage dealt
  { id: 'wizard',         name: 'Archmage',    from: 1,   hp: 1.35, dmg: 2.0, speed: 14, reach: 24, hit: 0.60,
    trait: { kind: 'burn',      power: 3,    label: 'Scorch' } },          // hits stop regen for 3s
  // --- hell ---
  { id: 'black_knight_a', name: 'Black Knight',from: 70,  hp: 1.20, dmg: 2.1, speed: 17, reach: 21, hit: 0.60,
    trait: { kind: 'aura',      power: 0.2,  label: 'Dread Aura' } },      // your swings 20% slower
  { id: 'demoness_a',     name: 'Succubus',    from: 90,  hp: 1.28, dmg: 2.3, speed: 16, reach: 24, hit: 0.60,
    trait: { kind: 'leech',     power: 1.0,  label: 'Life Kiss' } },
  { id: 'demon_d',        name: 'Pit Lord',    from: 110, hp: 1.34, dmg: 2.5, speed: 15, reach: 23, hit: 0.60,
    trait: { kind: 'enrage',    power: 0.6,  label: 'Tantrum' } },         // +60% damage under 30% hp
  { id: 'black_knight_b', name: 'Dread Knight',from: 130, hp: 1.40, dmg: 2.7, speed: 18, reach: 21, hit: 0.55,
    trait: { kind: 'block',     power: 0,    label: 'Iron Wall' } },       // every 3rd hit does nothing
  { id: 'warlock',        name: 'Warlock',     from: 150, hp: 1.46, dmg: 2.9, speed: 14, reach: 25, hit: 0.65,
    trait: { kind: 'curse',     power: 0.5,  label: 'Withering Curse' } }, // your regen halved
  { id: 'demoness_b',     name: 'Hell Matron', from: 170, hp: 1.52, dmg: 3.2, speed: 17, reach: 22, hit: 0.60,
    trait: { kind: 'frenzy',    power: 0.4,  label: 'Frenzy' } },          // swings faster as she bleeds
  { id: 'demon_e',        name: 'Archdemon',   from: 190, hp: 1.58, dmg: 3.5, speed: 16, reach: 24, hit: 0.60,
    trait: { kind: 'executioner', power: 0.8, label: 'Executioner' } },    // +80% when you are half dead
  { id: 'black_knight_c', name: 'Doom Herald', from: 210, hp: 1.65, dmg: 3.8, speed: 19, reach: 23, hit: 0.55,
    trait: { kind: 'ramp',      power: 0.04, label: 'Gathering Doom' } },  // +4% damage per second
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
export const BOSS_POOL = 5;        // how many bosses stay in the rotation

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

/** Bosses in rotation on a stage: the BOSS_POOL most recent unlocks. */
export function bossesForStage(stage) {
  return BOSSES.filter((b) => b.from <= stage).slice(-BOSS_POOL);
}

export function bossForStage(stage) {
  const pool = bossesForStage(stage);
  return pool[(Math.floor(stage / BOSS_EVERY) - 1) % pool.length];
}

/** Every sprite the game might need to load. */
export function allActorIds() {
  return [HERO.id, ...MOBS.map((m) => m.id), ...BOSSES.map((b) => b.id)];
}
