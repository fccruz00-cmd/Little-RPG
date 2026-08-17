// Hero level. Every kill grants experience; every level grants one skill
// point. Levelling does not touch any stat on its own, the tree is where the
// power comes from, otherwise it would be one more hidden curve.

export const LEVELS = {
  xpBase: 20,     xpGrowth: 1.22,     // XP to leave level n
  killXpBase: 4,  killXpGrowth: 1.11, // XP per kill, by stage
  eliteXp: 5,     bossXp: 12,         // final encounter multipliers
  pointsPerLevel: 1,
};

/** XP needed to leave `level` and reach the next one. */
export function xpToNext(level) {
  return Math.ceil(LEVELS.xpBase * Math.pow(LEVELS.xpGrowth, level - 1));
}

/** XP a kill grants on a stage. */
export function killXp(stage, mul = 1) {
  return LEVELS.killXpBase * Math.pow(LEVELS.killXpGrowth, stage - 1) * mul;
}
