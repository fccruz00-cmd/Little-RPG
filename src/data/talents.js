import { pct, mult } from '../format.js';

/**
 * The two skill trees.
 *
 * Every node feeds a "bonus": a key the `GameState` multiplies or adds on top
 * of the stats bought with gold. A node only unlocks once the previous one in
 * the same branch has at least one point, which is what gives the tree shape.
 *
 * `mode` says how the bonus stacks:
 *   'mul'  -> multiplier, 1 + per * ranks   (damage, gold, health...)
 *   'add'  -> plain sum, per * ranks        (crit chance, stages...)
 *   'less' -> reducer, 1 - per * ranks      (damage taken, timers, mobs)
 */

export const BONUS_KEYS = [
  'dmgMul', 'atkSpeedMul', 'critAdd', 'critPowerAdd', 'hpMul', 'regenMul',
  'goldMul', 'xpMul', 'moveMul', 'damageTaken', 'respawnMul', 'killsLess',
  'startStage', 'extraPoints',
  // forge and automation
  'dustChance', 'dustMul', 'bossTime', 'autoBuy', 'autoCraft',
  // combat skills
  'doubleHit', 'lifesteal', 'executeMul', 'ambush',
];

/** Seconds between automatic purchases at the first rank of Herald. */
export const AUTO_BUY_BASE = 6;

// --- skill tree (level points) --------------------------------------
export const TALENT_TREE = [
  {
    id: 'fury', name: 'Fury', accent: '#e67146',
    nodes: [
      { id: 'edge',      name: 'Keen Edge',  icon: 'damage',       max: 10, key: 'dmgMul',       mode: 'mul',  per: 0.06 },
      { id: 'haste',     name: 'Haste',      icon: 'attack_speed', max: 8,  key: 'atkSpeedMul',  mode: 'mul',  per: 0.04 },
      { id: 'precision', name: 'Precision',  icon: 'crit',         max: 5,  key: 'critAdd',      mode: 'add',  per: 0.02 },
      { id: 'carnage',   name: 'Carnage',    icon: 'crit_power',   max: 5,  key: 'critPowerAdd', mode: 'add',  per: 0.25 },
    ],
  },
  {
    id: 'guard', name: 'Guard', accent: '#5aa9c9',
    nodes: [
      { id: 'leather',   name: 'Tough Hide', icon: 'health', max: 10, key: 'hpMul',       mode: 'mul',  per: 0.08 },
      { id: 'stamina',   name: 'Stamina',    icon: 'regen',  max: 8,  key: 'regenMul',    mode: 'mul',  per: 0.12 },
      { id: 'carapace',  name: 'Carapace',   icon: 'shield', max: 5,  key: 'damageTaken', mode: 'less', per: 0.03 },
      { id: 'rally',     name: 'Rally',      icon: 'orb',    max: 3,  key: 'respawnMul',  mode: 'less', per: 0.20 },
    ],
  },
  {
    id: 'fortune', name: 'Fortune', accent: '#ebb85b',
    nodes: [
      { id: 'pockets', name: 'Deep Pockets', icon: 'gold',   max: 10, key: 'goldMul',   mode: 'mul', per: 0.08 },
      { id: 'lore',    name: 'Lore',         icon: 'book',   max: 8,  key: 'xpMul',     mode: 'mul', per: 0.08 },
      { id: 'stride',  name: 'Stride',       icon: 'stride', max: 5,  key: 'moveMul',   mode: 'mul', per: 0.06 },
      { id: 'scout',   name: 'Scout',        icon: 'scout',  max: 3,  key: 'killsLess', mode: 'add', per: 1 },
    ],
  },
];

// --- relic tree (prestige) ------------------------------------------
// Survives rebirth. `cost` is the price of the first point; every point after
// that costs one more.
export const RELIC_TREE = [
  {
    id: 'power', name: 'Power', accent: '#e67146',
    nodes: [
      { id: 'legacy',       name: 'Legacy',        icon: 'torch',        max: 15, cost: 1, key: 'dmgMul',       mode: 'mul', per: 0.15 },
      { id: 'ancientFury',  name: 'Ancient Fury',  icon: 'attack_speed', max: 8,  cost: 3, key: 'atkSpeedMul',  mode: 'mul', per: 0.05 },
      { id: 'deadlyStrike', name: 'Deadly Strike', icon: 'dagger',       max: 6,  cost: 4, key: 'critAdd',      mode: 'add', per: 0.05 },
      { id: 'wrath',        name: 'Wrath',         icon: 'crit_power',   max: 8,  cost: 5, key: 'critPowerAdd', mode: 'add', per: 0.4 },
    ],
  },
  {
    id: 'wealth', name: 'Wealth', accent: '#ebb85b',
    nodes: [
      { id: 'vault',    name: 'Vault',    icon: 'bag',   max: 15, cost: 1, key: 'goldMul',    mode: 'mul', per: 0.20 },
      { id: 'wisdom',   name: 'Wisdom',   icon: 'book',  max: 12, cost: 2, key: 'xpMul',      mode: 'mul', per: 0.20 },
      { id: 'heirloom', name: 'Heirloom', icon: 'crown', max: 12, cost: 3, key: 'startStage', mode: 'add', per: 2 },
      { id: 'shortcut', name: 'Shortcut', icon: 'scout', max: 4,  cost: 8, key: 'killsLess',  mode: 'add', per: 1 },
    ],
  },
  {
    id: 'essence', name: 'Essence', accent: '#6dba79',
    nodes: [
      { id: 'vigor',    name: 'Vigor',    icon: 'shield', max: 15, cost: 1, key: 'hpMul',       mode: 'mul',  per: 0.20 },
      { id: 'soul',     name: 'Soul',     icon: 'orb',    max: 12, cost: 2, key: 'regenMul',    mode: 'mul',  per: 0.25 },
      { id: 'immortal', name: 'Immortal', icon: 'health', max: 8,  cost: 4, key: 'damageTaken', mode: 'less', per: 0.04 },
      { id: 'veteran',  name: 'Veteran',  icon: 'stage',  max: 8,  cost: 4, key: 'extraPoints', mode: 'add',  per: 1 },
    ],
  },
  {
    id: 'automation', name: 'Automation', accent: '#5aa9c9',
    nodes: [
      { id: 'herald',    name: 'Herald',    icon: 'gear',  max: 5,  cost: 3,  key: 'autoBuy',    mode: 'add', per: 1 },
      { id: 'collector', name: 'Collector', icon: 'dust',  max: 10, cost: 2,  key: 'dustChance', mode: 'add', per: 0.04 },
      { id: 'grinder',   name: 'Grinder',   icon: 'bag',   max: 10, cost: 3,  key: 'dustMul',    mode: 'mul', per: 0.25 },
      { id: 'anvil',     name: 'Anvil',     icon: 'stage', max: 1,  cost: 15, key: 'autoCraft',  mode: 'add', per: 1 },
    ],
  },
  {
    id: 'skills', name: 'Skills', accent: '#c9c03d',
    nodes: [
      { id: 'doubleStrike', name: 'Double Strike', icon: 'bolt',   max: 10, cost: 2, key: 'doubleHit',  mode: 'add', per: 0.04 },
      { id: 'bloodthirst',  name: 'Bloodthirst',   icon: 'regen',  max: 10, cost: 3, key: 'lifesteal',  mode: 'add', per: 0.01 },
      { id: 'execute',      name: 'Execute',       icon: 'dagger', max: 8,  cost: 4, key: 'executeMul', mode: 'add', per: 0.20 },
      { id: 'ambush',       name: 'Ambush',        icon: 'crit',   max: 8,  cost: 4, key: 'ambush',     mode: 'add', per: 0.30 },
    ],
  },
  {
    id: 'time', name: 'Time', accent: '#b072c9',
    nodes: [
      { id: 'respite', name: 'Respite', icon: 'boss',   max: 6, cost: 3, key: 'bossTime',   mode: 'add',  per: 5 },
      { id: 'revive',  name: 'Revive',  icon: 'orb',    max: 4, cost: 4, key: 'respawnMul', mode: 'less', per: 0.20 },
      { id: 'march',   name: 'March',   icon: 'stride', max: 8, cost: 2, key: 'moveMul',    mode: 'mul',  per: 0.10 },
    ],
  },
];

/** What a node does at a given number of points. */
export function describeNode(node, ranks) {
  const n = Math.max(1, ranks); // with no points yet, show what the first buys
  const total = node.per * n;
  switch (node.key) {
    case 'critAdd':      return `+${pct(total)} crit chance`;
    case 'critPowerAdd': return `+${total.toFixed(2)} crit damage`;
    case 'startStage':   return `start at stage ${1 + total}`;
    case 'killsLess':    return `${total} fewer mob per stage`;
    case 'extraPoints':  return `+${total} skill point`;
    case 'damageTaken':  return `${pct(total)} less damage taken`;
    case 'respawnMul':   return `${pct(total)} faster to get up`;
    case 'dustChance':   return `+${pct(total)} dust chance`;
    case 'bossTime':     return `+${total}s on the boss timer`;
    case 'autoBuy':      return `buys for you every ${(AUTO_BUY_BASE - n + 1).toFixed(0)}s`;
    case 'autoCraft':    return 'forges for you when dust piles up';
    case 'doubleHit':    return `+${pct(total)} chance to strike twice`;
    case 'lifesteal':    return `heals ${pct(total)} of damage dealt`;
    case 'executeMul':   return `+${pct(total)} damage below 30% health`;
    case 'ambush':       return `+${pct(total)} on the first hit on each enemy`;
    default:             return `${mult(1 + total)} ${LABEL[node.key] ?? ''}`.trim();
  }
}

const LABEL = {
  dmgMul: 'damage',
  dustMul: 'dust',
  atkSpeedMul: 'attack speed',
  hpMul: 'health',
  regenMul: 'regen',
  goldMul: 'gold',
  xpMul: 'XP',
  moveMul: 'stride',
};

/** Relic cost to take a node from `ranks` to `ranks + 1`. */
export function relicCost(node, ranks) {
  return node.cost + ranks;
}
