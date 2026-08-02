/**
 * Mining, the first gathering skill.
 *
 * Veins spawn on the same line the hero already walks, so gathering needs no
 * input and its throughput is simply how fast you clear ground.
 *
 * The hero stops to swing at a vein, and measured over ten simulated minutes
 * at stages 3, 10, 25, 40 and 60, that costs exactly ZERO stage progress.
 * Travel is never the bottleneck: enemies walk toward you, so a swing only
 * changes where you meet them, not when. Do not read the swing as a cost.
 * The real tradeoff arrives with the second skill, when one tool slot has to
 * choose between a pickaxe, an axe and a rod.
 *
 * BALANCE RULE: mining never pays into damage. Kills produce ore, so ore
 * producing damage would rebuild the compounding loop the stat caps in
 * balance.js exist to prevent. Mining pays in access (better picks, and
 * later dungeon keys), in conversion (bars), and in flat per-node income
 * that is bounded by the kill rate.
 *
 * Second rule: yield per vein is FLAT within a tier. If it scaled with stage
 * the way gold does, ten stages would multiply income sixfold while costs
 * grew far slower, and every sink downstream would go stale.
 */

// --- ores -----------------------------------------------------------
// `tier` is both the order and the pick tier needed to mine it.
export const ORES = [
  { id: 'copper',  name: 'Copper',  tier: 0, minStage: 1,  color: '#c87f4a', per: 3, xp: 5,   smelt: 4 },
  { id: 'iron',    name: 'Iron',    tier: 1, minStage: 8,  color: '#b3b1b8', per: 3, xp: 13,  smelt: 5 },
  { id: 'silver',  name: 'Silver',  tier: 2, minStage: 20, color: '#dfe3ea', per: 3, xp: 34,  smelt: 6 },
  { id: 'gold',    name: 'Gold',    tier: 3, minStage: 36, color: '#ebb85b', per: 3, xp: 88,  smelt: 7 },
  { id: 'mithril', name: 'Mithril', tier: 4, minStage: 55, color: '#6dd3c4', per: 3, xp: 230, smelt: 8 },
];

export const ORE_BY_ID = Object.fromEntries(ORES.map((o) => [o.id, o]));

// --- pickaxes -------------------------------------------------------
// Each pick is paid for in the bars of the ore the previous one unlocked,
// which is what makes the chain bootstrap: copper buys the pick that reaches
// iron, iron buys the pick that reaches silver, and so on. Costs are set so
// a pick lands roughly every eight minutes of mining once its ore is in
// reach, which means the chain is really paced by how deep you have pushed.
// Bars pile up past that on purpose: they are the currency dungeon keys will
// want, and picks are the only sink until then.
export const PICKS = [
  { tier: 0, name: 'Worn Pick',    speed: 1,    yield: 1,    cost: null },
  { tier: 1, name: 'Copper Pick',  speed: 0.88, yield: 1.3,  cost: { ore: 'copper',  bars: 30 } },
  { tier: 2, name: 'Iron Pick',    speed: 0.78, yield: 1.7,  cost: { ore: 'iron',    bars: 50 } },
  { tier: 3, name: 'Silver Pick',  speed: 0.70, yield: 2.2,  cost: { ore: 'silver',  bars: 75 } },
  { tier: 4, name: 'Gold Pick',    speed: 0.63, yield: 2.9,  cost: { ore: 'gold',    bars: 110 } },
  { tier: 5, name: 'Mithril Pick', speed: 0.56, yield: 3.8,  cost: { ore: 'mithril', bars: 160 } },
];

export const MINING = {
  spacing: 130,      // world px between veins, before Deep Survey
  jitter: 45,        // random slack on that spacing
  swingTime: 1.6,    // seconds to work a vein with the Worn Pick
  minSwing: 0.35,    // however many ranks you buy, a swing costs this much
  teaseChance: 0.28, // how often a vein you cannot mine yet shows up anyway
  xpBase: 30,
  xpGrowth: 1.17,
  pointsPerLevel: 1,
};

/** XP needed to leave `level` of mining. */
export function mineXpToNext(level) {
  return Math.ceil(MINING.xpBase * Math.pow(MINING.xpGrowth, level - 1));
}

/** Best ore the stage has unlocked, ignoring what you can actually mine. */
export function bestOreForStage(stage) {
  let found = ORES[0];
  for (const ore of ORES) if (stage >= ore.minStage) found = ore;
  return found;
}

/**
 * What the next vein holds. Normally the best ore your pick can handle, but
 * sometimes the one just out of reach: a locked vein you walk past teaches
 * "upgrade your pick" far better than a vein that never spawns.
 */
export function rollOre(stage, pickTier, roll = Math.random()) {
  const best = bestOreForStage(stage);
  if (best.tier <= pickTier) return best;
  const reachable = ORES.filter((o) => stage >= o.minStage && o.tier <= pickTier);
  const mineable = reachable.at(-1) ?? ORES[0];
  return roll < MINING.teaseChance ? best : mineable;
}

/** Ore a vein of this type yields, before the double-strike roll. */
export function oreYield(ore, pickTier, bonus) {
  const pick = PICKS[pickTier] ?? PICKS[0];
  return Math.max(1, Math.round(ore.per * pick.yield * bonus.oreMul));
}

/** Seconds to work a vein. */
export function swingTime(pickTier, bonus) {
  const pick = PICKS[pickTier] ?? PICKS[0];
  return Math.max(MINING.minSwing, MINING.swingTime * pick.speed * bonus.mineSpeed);
}

/** Ore needed for one bar of it. */
export function smeltCost(ore, bonus) {
  return Math.max(2, Math.round(ore.smelt * bonus.smeltLess));
}

// --- mining tree ----------------------------------------------------
// Points come from mining levels, and only mining levels: the hero's own
// level still feeds the combat tree. 84 points to fill.
export const MINING_TREE = [
  {
    id: 'prospect', name: 'Prospect', accent: '#ebb85b',
    nodes: [
      { id: 'richVeins',  name: 'Rich Veins',  icon: 'ore',    max: 10, key: 'oreMul',    mode: 'mul', per: 0.08 },
      { id: 'luckyStrike', name: 'Lucky Strike', icon: 'crit', max: 5,  key: 'oreDouble', mode: 'add', per: 0.05 },
      { id: 'deepSurvey', name: 'Deep Survey', icon: 'scout',  max: 8,  key: 'nodeMul',   mode: 'mul', per: 0.06 },
      { id: 'motherlode', name: 'Motherlode',  icon: 'ore',    max: 5,  key: 'oreMul',    mode: 'mul', per: 0.15 },
    ],
  },
  {
    id: 'delve', name: 'Delve', accent: '#5aa9c9',
    nodes: [
      { id: 'swiftPick',  name: 'Swift Pick',  icon: 'pick',         max: 10, key: 'mineSpeed', mode: 'less', per: 0.04 },
      { id: 'minerGrit',  name: "Miner's Grit", icon: 'book',        max: 8,  key: 'mineXpMul', mode: 'mul',  per: 0.08 },
      { id: 'sureFooting', name: 'Sure Footing', icon: 'attack_speed', max: 5, key: 'mineSpeed', mode: 'less', per: 0.05 },
      { id: 'tireless',   name: 'Tireless',    icon: 'stride',       max: 5,  key: 'nodeMul',   mode: 'mul',  per: 0.10 },
    ],
  },
  {
    id: 'refine', name: 'Refine', accent: '#6dba79',
    nodes: [
      { id: 'smelter',  name: 'Smelter',   icon: 'bar',    max: 10, key: 'smeltLess', mode: 'less', per: 0.03 },
      { id: 'coinSeam', name: 'Coin Seam', icon: 'gold',   max: 8,  key: 'nodeGold',  mode: 'add',  per: 0.25 },
      { id: 'soulSeam', name: 'Soul Seam', icon: 'dust',   max: 5,  key: 'nodeDust',  mode: 'add',  per: 0.06 },
      { id: 'purity',   name: 'Purity',    icon: 'shield', max: 5,  key: 'smeltLess', mode: 'less', per: 0.04 },
    ],
  },
];
