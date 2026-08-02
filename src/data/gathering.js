/**
 * Gathering skills: Mining, Chopping and Fishing.
 *
 * All three run on the same rails. Nodes spawn on the line the hero already
 * walks, it stops and works them without input, and each skill keeps its own
 * level, its own tree and its own resource chain. Only the shape differs, so
 * this file is one system described three times rather than three systems.
 *
 * THE TRADEOFF LIVES HERE. Slice 1 measured that stopping to swing costs zero
 * stage progress, because enemies walk toward you and travel is never the
 * bottleneck. So gathering needed a real cost, and it is the tool slot: one
 * tool at a time, and only the equipped skill's nodes spawn. Time spent on
 * ore is time not spent on wood.
 *
 * BALANCE RULE, unchanged and load bearing: gathering never pays into damage.
 * Kills produce nodes, so nodes producing damage would rebuild the
 * compounding loop the stat caps in balance.js exist to prevent. It pays in
 * access (tools now, dungeon keys later), in conversion, in sustain
 * (Fishing's Well Fed is regen and armour, never attack), and in two flat
 * per-node trickles bounded by the kill rate.
 *
 * Second rule: yield per node is FLAT within a tier. Scaling it with stage
 * the way gold scales would multiply income sixfold every ten stages and
 * leave every sink downstream stale.
 */

// Depth gates are shared across the three skills on purpose: switching tools
// should change what you collect, never how deep you have to be.
const GATES = [1, 8, 20, 36, 55];

// --- resources ------------------------------------------------------
// `tier` is both the order and the tool tier needed to work it.
function tiers(rows) {
  return rows.map((row, i) => ({ ...row, tier: i, minStage: GATES[i] }));
}

export const ORES = tiers([
  { id: 'copper',  name: 'Copper',  color: '#c87f4a', per: 3, xp: 5,   refine: 4 },
  { id: 'iron',    name: 'Iron',    color: '#b3b1b8', per: 3, xp: 13,  refine: 5 },
  { id: 'silver',  name: 'Silver',  color: '#dfe3ea', per: 3, xp: 34,  refine: 6 },
  { id: 'gold',    name: 'Gold',    color: '#ebb85b', per: 3, xp: 88,  refine: 7 },
  { id: 'mithril', name: 'Mithril', color: '#6dd3c4', per: 3, xp: 230, refine: 8 },
]);

export const LOGS = tiers([
  { id: 'pine',      name: 'Pine',      color: '#a3763f', per: 3, xp: 5,   refine: 4 },
  { id: 'oak',       name: 'Oak',       color: '#8a6033', per: 3, xp: 13,  refine: 5 },
  { id: 'ash',       name: 'Ash',       color: '#c2b28a', per: 3, xp: 34,  refine: 6 },
  { id: 'yew',       name: 'Yew',       color: '#7fa05a', per: 3, xp: 88,  refine: 7 },
  { id: 'heartwood', name: 'Heartwood', color: '#b0729e', per: 3, xp: 230, refine: 8 },
]);

export const FISH = tiers([
  { id: 'minnow',   name: 'Minnow',   color: '#9fb6c4', per: 3, xp: 5,   refine: 4 },
  { id: 'carp',     name: 'Carp',     color: '#c9a15a', per: 3, xp: 13,  refine: 5 },
  { id: 'trout',    name: 'Trout',    color: '#8fc4a8', per: 3, xp: 34,  refine: 6 },
  { id: 'salmon',   name: 'Salmon',   color: '#e6836a', per: 3, xp: 88,  refine: 7 },
  { id: 'sturgeon', name: 'Sturgeon', color: '#7d8fd6', per: 3, xp: 230, refine: 8 },
]);

// --- tools ----------------------------------------------------------
// A tool is a head and a handle: metal from Mining, wood from Chopping. That
// is the lock between the skills. Every tool needs both, so no line can be
// pushed alone, and the tier below is what pays for the tier above.
//
// All three tool lines cost the same, and you have to upgrade three of them
// while only ever gathering with one, which is what gives the tool slot its
// weight.
export const TOOL_TIERS = [
  { tier: 0, speed: 1,    yield: 1,   cost: null },
  { tier: 1, speed: 0.88, yield: 1.3, cost: { bars: 30,  planks: 20 } },
  { tier: 2, speed: 0.78, yield: 1.7, cost: { bars: 50,  planks: 34 } },
  { tier: 3, speed: 0.70, yield: 2.2, cost: { bars: 75,  planks: 50 } },
  { tier: 4, speed: 0.63, yield: 2.9, cost: { bars: 110, planks: 74 } },
  { tier: 5, speed: 0.56, yield: 3.8, cost: { bars: 160, planks: 110 } },
];

// Named for the head, because that is the part that decides what it bites
// through. The handle is wood of the matching tier.
const TOOL_GRADE = ['Worn', 'Copper', 'Iron', 'Silver', 'Gold', 'Mithril'];

export function toolName(skill, tier) {
  return `${TOOL_GRADE[tier] ?? '?'} ${SKILLS[skill].toolName}`;
}

/** What tier N of any tool costs: ore bars and wood planks of tier N-1. */
export function toolCost(tier) {
  const spec = TOOL_TIERS[tier];
  if (!spec?.cost) return null;
  return {
    ore: ORES[tier - 1].id,
    bars: spec.cost.bars,
    log: LOGS[tier - 1].id,
    planks: spec.cost.planks,
  };
}

// --- skills ---------------------------------------------------------
export const GATHER = {
  spacing: 130,      // world px between nodes, before Deep Survey
  jitter: 45,        // random slack on that spacing
  workTime: 1.6,     // seconds to work a node with a Worn tool
  minWork: 0.35,     // however many ranks you buy, a swing costs this much
  teaseChance: 0.28, // how often a node you cannot work yet shows up anyway
  xpBase: 30,
  xpGrowth: 1.17,
  pointsPerLevel: 1,
  switchEvery: 60,   // seconds between tools when Forager is doing it
};

// Well Fed: Fishing's payout. A meal is eaten automatically, lasts a while,
// and gives regen and a damage reduction. Never attack, by the balance rule
// above; this is the track that keeps you standing at depth.
export const MEAL = {
  time: 90,          // seconds one meal lasts
  regenPerTier: 0.4, // +40% regen per tier of the fish eaten
  armorPerTier: 0.03,
};

export const SKILLS = {
  mining: {
    id: 'mining', name: 'Mining', accent: '#ebb85b',
    toolName: 'Pick', toolIcon: 'pick', nodeKind: 'vein',
    raw: 'ore', rawIcon: 'ore', refined: 'bar', refinedIcon: 'bar',
    refinedName: 'bar', verb: 'Smelt', resources: ORES,
  },
  chopping: {
    id: 'chopping', name: 'Chopping', accent: '#6dba79',
    toolName: 'Axe', toolIcon: 'axe', nodeKind: 'tree',
    raw: 'log', rawIcon: 'log', refined: 'plank', refinedIcon: 'plank',
    refinedName: 'plank', verb: 'Saw', resources: LOGS,
  },
  fishing: {
    id: 'fishing', name: 'Fishing', accent: '#5aa9c9',
    toolName: 'Rod', toolIcon: 'rod', nodeKind: 'pool',
    raw: 'fish', rawIcon: 'fish', refined: 'meal', refinedIcon: 'regen',
    refinedName: 'meal', verb: 'Cook', resources: FISH,
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

/** XP needed to leave `level` of any gathering skill. */
export function gatherXpToNext(level) {
  return Math.ceil(GATHER.xpBase * Math.pow(GATHER.xpGrowth, level - 1));
}

/** Best resource the stage has unlocked, ignoring what the tool can work. */
export function bestForStage(skillId, stage) {
  const list = SKILLS[skillId].resources;
  let found = list[0];
  for (const r of list) if (stage >= r.minStage) found = r;
  return found;
}

/**
 * What the next node holds. Normally the best your tool can handle, but
 * sometimes the one just out of reach: a node you walk past teaches "upgrade
 * your tool" far better than one that never spawns.
 */
export function rollResource(skillId, stage, toolTier, roll = Math.random()) {
  const list = SKILLS[skillId].resources;
  const best = bestForStage(skillId, stage);
  if (best.tier <= toolTier) return best;
  const reachable = list.filter((r) => stage >= r.minStage && r.tier <= toolTier);
  return roll < GATHER.teaseChance ? best : (reachable.at(-1) ?? list[0]);
}

/** Raw units a node yields, before the double roll. */
export function nodeYield(resource, toolTier, bonus) {
  const tool = TOOL_TIERS[toolTier] ?? TOOL_TIERS[0];
  return Math.max(1, Math.round(resource.per * tool.yield * bonus.yieldMul));
}

/** Seconds to work a node. */
export function workTime(toolTier, bonus) {
  const tool = TOOL_TIERS[toolTier] ?? TOOL_TIERS[0];
  return Math.max(GATHER.minWork, GATHER.workTime * tool.speed * bonus.gatherSpeed);
}

/** Raw units needed for one refined unit. */
export function refineCost(resource, bonus) {
  return Math.max(2, Math.round(resource.refine * bonus.refineLess));
}

// --- trees ----------------------------------------------------------
// One tree per skill, 84 points each, fed only by that skill's own levels.
// The keys repeat across the three because they mean the same thing; each
// tree is scored into its OWN bonus object, so Swift Pick speeds up mining
// and nothing else.
function branch(id, name, accent, nodes) {
  return { id: `${id}`, name, accent, nodes };
}

const OUTPUT = (ids, icons) => [
  { id: ids[0], name: icons.rich,  icon: icons.raw,   max: 10, key: 'yieldMul',    mode: 'mul', per: 0.08 },
  { id: ids[1], name: icons.lucky, icon: 'crit',      max: 5,  key: 'yieldDouble', mode: 'add', per: 0.05 },
  { id: ids[2], name: 'Survey',    icon: 'scout',     max: 8,  key: 'nodeMul',     mode: 'mul', per: 0.06 },
  { id: ids[3], name: icons.big,   icon: icons.raw,   max: 5,  key: 'yieldMul',    mode: 'mul', per: 0.15 },
];

const SPEED = (ids, toolIcon) => [
  { id: ids[0], name: 'Swift Hands', icon: toolIcon,       max: 10, key: 'gatherSpeed', mode: 'less', per: 0.04 },
  { id: ids[1], name: 'Practice',    icon: 'book',         max: 8,  key: 'gatherXpMul', mode: 'mul',  per: 0.08 },
  { id: ids[2], name: 'Sure Grip',   icon: 'attack_speed', max: 5,  key: 'gatherSpeed', mode: 'less', per: 0.05 },
  { id: ids[3], name: 'Tireless',    icon: 'stride',       max: 5,  key: 'nodeMul',     mode: 'mul',  per: 0.10 },
];

export const SKILL_TREES = {
  mining: [
    branch('prospect', 'Prospect', '#ebb85b', OUTPUT(
      ['richVeins', 'luckyStrike', 'deepSurvey', 'motherlode'],
      { rich: 'Rich Veins', lucky: 'Lucky Strike', big: 'Motherlode', raw: 'ore' })),
    branch('delve', 'Delve', '#5aa9c9', SPEED(
      ['swiftPick', 'minerGrit', 'sureFooting', 'tireless'], 'pick')),
    branch('refine', 'Refine', '#6dba79', [
      { id: 'smelter',  name: 'Smelter',   icon: 'bar',    max: 10, key: 'refineLess', mode: 'less', per: 0.03 },
      { id: 'coinSeam', name: 'Coin Seam', icon: 'gold',   max: 8,  key: 'nodeGold',   mode: 'add',  per: 0.25 },
      { id: 'soulSeam', name: 'Soul Seam', icon: 'dust',   max: 5,  key: 'nodeDust',   mode: 'add',  per: 0.06 },
      { id: 'purity',   name: 'Purity',    icon: 'shield', max: 5,  key: 'refineLess', mode: 'less', per: 0.04 },
    ]),
  ],
  chopping: [
    branch('timber', 'Timber', '#6dba79', OUTPUT(
      ['thickBoles', 'cleanFell', 'woodSurvey', 'oldGrowth'],
      { rich: 'Thick Boles', lucky: 'Clean Fell', big: 'Old Growth', raw: 'log' })),
    branch('felling', 'Felling', '#ebb85b', SPEED(
      ['swiftAxe', 'lumberLore', 'sureStance', 'stamina'], 'axe')),
    branch('millwork', 'Millwork', '#c9a15a', [
      { id: 'sawmill',  name: 'Sawmill',   icon: 'plank',  max: 10, key: 'refineLess', mode: 'less', per: 0.03 },
      { id: 'sapSeam',  name: 'Sap Trade', icon: 'gold',   max: 8,  key: 'nodeGold',   mode: 'add',  per: 0.25 },
      { id: 'heartSap', name: 'Heart Sap', icon: 'dust',   max: 5,  key: 'nodeDust',   mode: 'add',  per: 0.06 },
      { id: 'seasoned', name: 'Seasoned',  icon: 'shield', max: 5,  key: 'refineLess', mode: 'less', per: 0.04 },
    ]),
  ],
  fishing: [
    branch('angling', 'Angling', '#5aa9c9', OUTPUT(
      ['deepWater', 'doubleBite', 'shoalSense', 'bigCatch'],
      { rich: 'Deep Water', lucky: 'Double Bite', big: 'Big Catch', raw: 'fish' })),
    branch('patience', 'Patience', '#9fb6c4', SPEED(
      ['swiftCast', 'anglerLore', 'steadyHand', 'endurance'], 'rod')),
    // Fishing's third branch is the one that differs: it feeds Well Fed,
    // the sustain track, instead of a second conversion curve.
    branch('galley', 'Galley', '#e6836a', [
      { id: 'cook',     name: 'Cook',      icon: 'regen',   max: 10, key: 'refineLess', mode: 'less', per: 0.03 },
      { id: 'hearty',   name: 'Hearty',    icon: 'regen',  max: 8,  key: 'fedRegen',   mode: 'mul',  per: 0.15 },
      { id: 'preserve', name: 'Preserve',  icon: 'orb',    max: 5,  key: 'mealTime',   mode: 'mul',  per: 0.20 },
      { id: 'stout',    name: 'Stout',     icon: 'shield', max: 5,  key: 'fedArmor',   mode: 'add',  per: 0.01 },
    ]),
  ],
};

/** Keys a per-skill bonus object carries. Shared names, separate namespaces. */
export const GATHER_KEYS = [
  'yieldMul', 'yieldDouble', 'nodeMul', 'gatherSpeed', 'gatherXpMul',
  'refineLess', 'nodeGold', 'nodeDust', 'fedRegen', 'mealTime', 'fedArmor',
];

/** Of those, the ones that multiply rather than add. */
export const GATHER_MULS = [
  'yieldMul', 'nodeMul', 'gatherSpeed', 'gatherXpMul', 'refineLess',
  'fedRegen', 'mealTime',
];

/** What a gathering node does at a given number of points. */
export function describeGatherNode(node, ranks) {
  const n = Math.max(1, ranks);
  const total = node.per * n;
  const pct = (v) => `${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}%`;
  switch (node.key) {
    case 'yieldDouble': return `+${pct(total)} chance a node pays twice`;
    case 'gatherSpeed': return `${pct(total)} faster to work a node`;
    case 'refineLess':  return `${pct(total)} less raw per unit`;
    case 'nodeGold':    return `nodes also pay ${total.toFixed(2)}x a mob's gold`;
    case 'nodeDust':    return `+${pct(total)} chance a node drops dust`;
    case 'fedArmor':    return `Well Fed also cuts ${pct(total)} more damage`;
    case 'mealTime':    return `meals last ${pct(total)} longer`;
    case 'fedRegen':    return `Well Fed regen +${pct(total)}`;
    case 'yieldMul':    return `x${(1 + total).toFixed(2)} per node`;
    case 'nodeMul':     return `x${(1 + total).toFixed(2)} nodes on the road`;
    case 'gatherXpMul': return `x${(1 + total).toFixed(2)} skill XP`;
    default:            return `x${(1 + total).toFixed(2)}`;
  }
}
