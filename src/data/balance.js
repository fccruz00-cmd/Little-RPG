// Every progression number lives here. This is the only file you need to
// touch to rebalance the game.

// --- enemies --------------------------------------------------------
export const ENEMY = {
  hpBase: 9.5,    hpGrowth: 1.208,  // health per stage
  dmgBase: 4.6,   dmgGrowth: 1.155, // damage per stage
  goldBase: 4.5,  goldGrowth: 1.20, // gold per kill

  // Multipliers for the encounter that closes a stage.
  eliteHp: 5,     eliteDmg: 1.8,  eliteGold: 5,   // mini boss, every stage (flat values)
  bossHp: 12,     bossDmg: 1.0,   bossGold: 14,   // boss, every 5 stages

  // Attack cadence. A regular mob has to land a hit before it dies, otherwise
  // it is just a punching bag and the fight carries no tension, which is why
  // the period sits below the typical time to kill.
  attackPeriod: 1.25,
  eliteAttackPeriod: 1.3,
  bossAttackPeriod: 1.5,
};

export const BOSS_TIME = 30;        // seconds to bring the boss down

export function enemyHp(stage, mul = 1) {
  return ENEMY.hpBase * Math.pow(ENEMY.hpGrowth, stage - 1) * mul;
}
export function enemyDamage(stage, mul = 1) {
  return ENEMY.dmgBase * Math.pow(ENEMY.dmgGrowth, stage - 1) * mul;
}
export function enemyGold(stage, mul = 1) {
  return ENEMY.goldBase * Math.pow(ENEMY.goldGrowth, stage - 1) * mul;
}

// --- hero -----------------------------------------------------------
// Each upgrade has value(lvl) and cost(lvl). `lvl` starts at 0.
//
// Only `damage`, `maxHp` and `regen` grow without a ceiling: they are the
// exponential rails that track the stage curve. Everything else has a `cap`,
// otherwise the multipliers pile up and the hero one-shots everything around
// stage 25 (gold gain in particular fed itself: more gold, more gold).
export const STATS = {
  damage:    { base: 6,    growth: 1.115, cost: 15,  costGrowth: 1.130 },
  attackRate:{ base: 0.85, growth: 1.038, cost: 45,  costGrowth: 1.260, cap: 5 },
  critChance:{ base: 0.03, step: 0.014,   cost: 90,  costGrowth: 1.300, cap: 0.5 },
  critPower: { base: 1.6,  step: 0.08,    cost: 140, costGrowth: 1.300, cap: 6 },
  maxHp:     { base: 70,   growth: 1.125, cost: 25,  costGrowth: 1.135 },
  regen:     { base: 1.5,  growth: 1.140, cost: 55,  costGrowth: 1.170 },
  goldGain:  { base: 1,    step: 0.05,    cost: 200, costGrowth: 1.320, cap: 3 },
  moveSpeed: { base: 34,   step: 3.2,     cost: 70,  costGrowth: 1.280, cap: 110 },
};

/** Value of a stat at a given level. */
export function statValue(key, lvl) {
  const s = STATS[key];
  const v = s.growth != null
    ? s.base * Math.pow(s.growth, lvl)
    : s.base + s.step * lvl;
  return s.cap != null ? Math.min(s.cap, v) : v;
}

/** Last useful level of a capped stat (Infinity when uncapped). */
export function statMaxLevel(key) {
  const s = STATS[key];
  if (s.cap == null) return Infinity;
  return s.growth != null
    ? Math.ceil(Math.log(s.cap / s.base) / Math.log(s.growth))
    : Math.ceil((s.cap - s.base) / s.step);
}

/** Cost of the next level (going from `lvl` to `lvl + 1`). */
export function statCost(key, lvl) {
  const s = STATS[key];
  return Math.ceil(s.cost * Math.pow(s.costGrowth, lvl));
}

/** Cost of buying `n` levels at once (geometric series sum). */
export function statCostBulk(key, lvl, n) {
  const s = STATS[key];
  const r = s.costGrowth;
  return Math.ceil(s.cost * Math.pow(r, lvl) * (Math.pow(r, n) - 1) / (r - 1));
}

/**
 * How many levels `gold` buys starting from `lvl`. Inverts the series sum,
 * then fixes up the rounding.
 */
export function affordableLevels(key, lvl, gold) {
  const s = STATS[key];
  const room = statMaxLevel(key) - lvl;
  if (room <= 0) return 0;
  const r = s.costGrowth;
  const first = s.cost * Math.pow(r, lvl);
  if (gold < first) return 0;
  let n = Math.floor(Math.log(1 + (gold * (r - 1)) / first) / Math.log(r));
  while (n > 0 && statCostBulk(key, lvl, n) > gold) n--;
  while (statCostBulk(key, lvl, n + 1) <= gold) n++;
  return Math.min(n, room);
}

// --- idle -----------------------------------------------------------
export const OFFLINE = {
  maxHours: 8,    // cap on the time credited
  rate: 0.5,      // efficiency while the game is closed
};
