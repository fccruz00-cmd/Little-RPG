/**
 * Every tree in the game, laid out as a web.
 *
 * The machinery lives in `web.js`; this file is only topology -- which node
 * sits where, and what touches what. Node DATA (max, cost, key, mode, per)
 * stays in the file that owns the tree, so there is exactly one place to
 * change what a node does.
 *
 * All five layouts are the same silhouette: three lanes, links between them.
 * What differs is how much a link costs.
 *
 *   TALENTS  seven long lanes, four crossing NODES -- the tree you touch once
 *            per level, so splitting it should hurt a little.
 *   RELICS   the same, and the crossings are the four things every build
 *            wants (spare points, boss time, and the two automations).
 *   SOULS    four-wide lanes, and the crossings ARE the small branches: pets
 *            and gathering sit between the pillars, which is where they
 *            belong.
 *   SKILLS   twelve nodes each, so the lanes link DIRECTLY. There is nothing
 *            worth spending a crossing on in a tree this size, and charging
 *            for one would just be a tax.
 */

import { RELIC_TREE, SOUL_TREE } from './talents.js';
import { SKILL_IDS, SKILL_TREES } from './gathering.js';
import { makeWeb, webUnlocked, webGate, lane, cross, byId, wires, cols, LANE_Y } from './web.js';

export { webUnlocked, webGate };

// --- talents (level points) -------------------------------------------
// The only web whose nodes are defined here: it has no column tree left to
// take them from.

export const TALENT_LANES = [
  { id: 'fury',    name: 'Fury',    accent: '#e67146', y: 0 },
  { id: 'guard',   name: 'Guard',   accent: '#5aa9c9', y: 2 },
  { id: 'fortune', name: 'Fortune', accent: '#ebb85b', y: 4 },
];

const TALENT_NODES = byId([{ nodes: [
  // Fury: hit harder, hit oftener
  { id: 'edge',      name: 'Keen Edge', icon: 'damage',       max: 15, key: 'dmgMul',       mode: 'mul', per: 0.06 },
  { id: 'haste',     name: 'Haste',     icon: 'attack_speed', max: 10, key: 'atkSpeedMul',  mode: 'mul', per: 0.04 },
  { id: 'precision', name: 'Precision', icon: 'crit',         max: 8,  key: 'critAdd',      mode: 'add', per: 0.02 },
  { id: 'carnage',   name: 'Carnage',   icon: 'crit_power',   max: 8,  key: 'critPowerAdd', mode: 'add', per: 0.25 },
  { id: 'rupture',   name: 'Rupture',   icon: 'dagger',       max: 6,  key: 'executeMul',   mode: 'add', per: 0.10 },
  { id: 'onslaught', name: 'Onslaught', icon: 'bolt',         max: 6,  key: 'doubleHit',    mode: 'add', per: 0.02 },
  { id: 'frenzy',    name: 'Frenzy',    icon: 'torch',        max: 10, key: 'frenzy',       mode: 'add', per: 0.003 },

  // Guard: still standing
  { id: 'leather',  name: 'Tough Hide', icon: 'health', max: 15, key: 'hpMul',       mode: 'mul',  per: 0.08 },
  { id: 'stamina',  name: 'Stamina',    icon: 'regen',  max: 12, key: 'regenMul',    mode: 'mul',  per: 0.12 },
  { id: 'carapace', name: 'Carapace',   icon: 'shield', max: 8,  key: 'damageTaken', mode: 'less', per: 0.03 },
  { id: 'rally',    name: 'Rally',      icon: 'orb',    max: 5,  key: 'respawnMul',  mode: 'less', per: 0.12 },
  { id: 'mending',  name: 'Mending',    icon: 'regen',  max: 6,  key: 'lifesteal',   mode: 'add',  per: 0.005 },
  { id: 'bulwark',  name: 'Bulwark',    icon: 'boss',   max: 5,  key: 'bossTime',    mode: 'add',  per: 2 },
  { id: 'thorns',   name: 'Thorns',     icon: 'shield', max: 6,  key: 'thorns',      mode: 'add',  per: 0.05 },

  // Fortune: everything the fight leaves behind
  { id: 'pockets',    name: 'Deep Pockets', icon: 'gold',   max: 15, key: 'goldMul',    mode: 'mul', per: 0.08 },
  { id: 'lore',       name: 'Lore',         icon: 'book',   max: 12, key: 'xpMul',      mode: 'mul', per: 0.08 },
  { id: 'stride',     name: 'Stride',       icon: 'stride', max: 8,  key: 'moveMul',    mode: 'mul', per: 0.06 },
  { id: 'scout',      name: 'Scout',        icon: 'scout',  max: 3,  key: 'killsLess',  mode: 'add', per: 1 },
  { id: 'prospector', name: 'Prospector',   icon: 'dust',   max: 6,  key: 'dustChance', mode: 'add', per: 0.02 },
  { id: 'vigil',      name: 'Vigil',        icon: 'crit',   max: 6,  key: 'ambush',     mode: 'add', per: 0.08 },
  { id: 'treasure',   name: 'Treasure',     icon: 'bag',    max: 6,  key: 'treasure',   mode: 'add', per: 0.03 },

  // The crossings sit BETWEEN two lanes and carry something both of them
  // want, so the point a lane change costs is not a toll for nothing.
  { id: 'tempered',  name: 'Tempered',  icon: 'gear',   max: 6, key: 'damageTaken', mode: 'less', per: 0.02 },
  { id: 'scavenger', name: 'Scavenger', icon: 'bag',    max: 8, key: 'goldMul',     mode: 'mul',  per: 0.05 },
  { id: 'bloodlust', name: 'Bloodlust', icon: 'dagger', max: 6, key: 'lifesteal',   mode: 'add',  per: 0.004 },
  { id: 'plunder',   name: 'Plunder',   icon: 'dust',   max: 8, key: 'dustMul',     mode: 'mul',  per: 0.10 },
] }]);

const FURY    = ['edge', 'haste', 'precision', 'carnage', 'rupture', 'onslaught', 'frenzy'];
const GUARD   = ['leather', 'stamina', 'carapace', 'rally', 'mending', 'bulwark', 'thorns'];
const FORTUNE = ['pockets', 'lore', 'stride', 'scout', 'prospector', 'vigil', 'treasure'];

export const TALENT_WEB = makeWeb({
  id: 'talent',
  lanes: TALENT_LANES,
  colW: cols(7),
  nodes: [
    ...lane('fury',    0, FURY,    TALENT_NODES),
    ...lane('guard',   2, GUARD,   TALENT_NODES),
    ...lane('fortune', 4, FORTUNE, TALENT_NODES),
    cross('tempered',  2, 1, TALENT_NODES),
    cross('bloodlust', 5, 1, TALENT_NODES),
    cross('scavenger', 2, 3, TALENT_NODES),
    cross('plunder',   5, 3, TALENT_NODES),
  // The end of a lane is a keystone: it does not open until the node before
  // it is FULL, so it costs a committed lane rather than a spare point, and
  // what it buys changes how a fight goes instead of how big a number is.
  ].map((n) => (['frenzy', 'thorns', 'treasure'].includes(n.id)
    ? { ...n, kind: 'keystone' } : n)),
  edges: wires([FURY, GUARD, FORTUNE], [
    ['haste', 'stamina', 'tempered'],
    ['rupture', 'mending', 'bloodlust'],
    ['stamina', 'lore', 'scavenger'],
    ['mending', 'prospector', 'plunder'],
  ]),
});

// --- relics (prestige) -------------------------------------------------
// Six branches became three lanes, because three is what the panel holds.
// The four things that ended up between them -- spare skill points, boss
// time, and the two automations -- are the four every build wants, which is
// exactly what a crossing should be.

export const RELIC_LANES = [
  { id: 'power',   name: 'Power',   accent: '#e67146', y: 0 },
  { id: 'essence', name: 'Essence', accent: '#6dba79', y: 2 },
  { id: 'wealth',  name: 'Wealth',  accent: '#ebb85b', y: 4 },
];

const RELIC_NODES = byId(RELIC_TREE);
const R_POWER   = ['legacy', 'ancientFury', 'deadlyStrike', 'wrath', 'doubleStrike', 'execute', 'ambush'];
const R_ESSENCE = ['vigor', 'soul', 'immortal', 'bloodthirst', 'revive', 'march'];
const R_WEALTH  = ['vault', 'wisdom', 'heirloom', 'shortcut', 'collector', 'grinder', 'herald'];

export const RELIC_WEB = makeWeb({
  id: 'relic',
  lanes: RELIC_LANES,
  colW: cols(7),
  nodes: [
    ...lane('power',   0, R_POWER,   RELIC_NODES),
    ...lane('essence', 2, R_ESSENCE, RELIC_NODES),
    ...lane('wealth',  4, R_WEALTH,  RELIC_NODES),
    cross('veteran', 2, 1, RELIC_NODES),
    cross('respite', 5, 1, RELIC_NODES),
    cross('forager', 2, 3, RELIC_NODES),
    cross('anvil',   5, 3, RELIC_NODES),
  ],
  edges: wires([R_POWER, R_ESSENCE, R_WEALTH], [
    ['ancientFury', 'soul', 'veteran'],
    ['doubleStrike', 'revive', 'respite'],
    ['soul', 'wisdom', 'forager'],
    ['revive', 'collector', 'anvil'],
  ]),
});

// --- souls (awakening) -------------------------------------------------
// Menagerie and Harvest were two nodes each, which is exactly the size of a
// crossing. Pets and gathering now sit BETWEEN the three pillars instead of
// hanging off the end, which is where they always belonged: they are what
// you buy when you are done choosing.

export const SOUL_LANES = [
  { id: 'ascendant', name: 'Ascendant', accent: '#c79ae8', y: 0 },
  { id: 'eternity',  name: 'Eternity',  accent: '#6dba79', y: 2 },
  { id: 'dominion',  name: 'Dominion',  accent: '#ebb85b', y: 4 },
];

const SOUL_NODES = byId(SOUL_TREE);
const S_ASCENDANT = ['soulfire', 'rend', 'annihilate', 'cataclysm'];
const S_ETERNITY  = ['memory', 'bloodline', 'aegis', 'eternalHour'];
const S_DOMINION  = ['avarice', 'epiphany', 'hoard', 'conquest'];

export const SOUL_WEB = makeWeb({
  id: 'soul',
  lanes: SOUL_LANES,
  colW: cols(4),
  nodes: [
    ...lane('ascendant', 0, S_ASCENDANT, SOUL_NODES),
    ...lane('eternity',  2, S_ETERNITY,  SOUL_NODES),
    ...lane('dominion',  4, S_DOMINION,  SOUL_NODES),
    cross('packLeader',   2, 1, SOUL_NODES),
    cross('keepersTable', 4, 1, SOUL_NODES),
    cross('greenThumb',   2, 3, SOUL_NODES),
    cross('quickHands',   4, 3, SOUL_NODES),
  ],
  edges: wires([S_ASCENDANT, S_ETERNITY, S_DOMINION], [
    ['rend', 'bloodline', 'packLeader'],
    ['cataclysm', 'eternalHour', 'keepersTable'],
    ['bloodline', 'epiphany', 'greenThumb'],
    ['eternalHour', 'conquest', 'quickHands'],
  ]),
});

// --- gathering skills --------------------------------------------------
// Three branches of four, already the right shape. All they were missing was
// a way across, and at twelve nodes a crossing would be a tax rather than a
// decision -- so these lanes link straight to each other.

export const SKILL_WEBS = Object.fromEntries(SKILL_IDS.map((id) => {
  const tree = SKILL_TREES[id];
  const nodes = byId(tree);
  const laneIds = tree.map((b) => b.nodes.map((n) => n.id));
  return [id, makeWeb({
    id,
    lanes: tree.map((b, i) => ({ id: b.id, name: b.name, accent: b.accent, y: LANE_Y[i] })),
    colW: cols(Math.max(...laneIds.map((ids) => ids.length))),
    nodes: tree.flatMap((b, i) => lane(b.id, LANE_Y[i], laneIds[i], nodes)),
    edges: wires(laneIds, [
      [laneIds[0][1], laneIds[1][1], null],
      [laneIds[0][3], laneIds[1][3], null],
      [laneIds[1][1], laneIds[2][1], null],
      [laneIds[1][3], laneIds[2][3], null],
    ]),
  })];
}));

/** Every web the trees tab and the skills tab draw, by the UI's kind name. */
export const WEBS = {
  talent: TALENT_WEB,
  relic: RELIC_WEB,
  soul: SOUL_WEB,
  ...SKILL_WEBS,
};
