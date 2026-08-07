import { pct, mult } from '../format.js';
import { t } from '../i18n.js';

/**
 * The prestige trees, and the vocabulary every tree in the game speaks.
 *
 * Every node feeds a "bonus": a key the `GameState` multiplies or adds on top
 * of the stats bought with gold. In these column trees a node unlocks once the
 * previous one in the same branch has at least one point; the talent WEB in
 * `skilltree.js` uses the same node shape with a graph rule instead.
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
  // keystones: the three that change how a fight goes, not how big a number is
  'frenzy', 'thorns', 'treasure',
  // forge and automation
  'dustChance', 'dustMul', 'bossTime', 'autoBuy', 'autoCraft', 'autoSwitch',
  // combat skills
  'doubleHit', 'lifesteal', 'executeMul', 'ambush',
  // pets and gathering, reached only by the soul tree
  'petPower', 'feedLess', 'yieldAll', 'workAll',
];

/**
 * How many kills a Frenzy streak counts before it stops growing. Without a
 * ceiling an idle game hands you an unbounded multiplier for going AFK on a
 * stage you have outgrown, which is the opposite of a reward for pushing.
 */
export const FRENZY_CAP = 15;

/** Seconds between automatic purchases at the first rank of Herald. */
export const AUTO_BUY_BASE = 6;

/** Seconds between tool swaps once Forager is bought. Mirrors GATHER.switchEvery. */
export const AUTO_SWITCH_EVERY = 60;

// The tree bought with level points is no longer a column at all -- it is the
// web in `skilltree.js`. What stayed here is everything the OTHER trees still
// share with it: the bonus keys, the caps, and `describeNode`.

// --- relic tree (prestige) ------------------------------------------
// Survives rebirth. `cost` is the price of the first point; every point after
// that costs one more.
export const RELIC_TREE = [
  {
    id: 'power', name: 'Power', accent: '#e67146',
    nodes: [
      { id: 'legacy',       name: 'Legacy',        icon: 'torch',        max: 15, cost: 1, key: 'dmgMul',       mode: 'mul', per: 0.15 },
      // The uncapped rail, twin to the soul tree's Transcendence: the one
      // place a relic FLOOD (dungeons pay in dozens now) turns into depth
      // after every capped node fills. Costs climb linearly, so the sink
      // is quadratic against income and the pace holds itself.
      { id: 'warpath', name: 'Warpath', icon: 'dagger', max: 99, cost: 6, key: 'dmgMul', mode: 'mul', per: 0.10 },
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
      // Warpath's shieldmate, same reasoning as Undying beside Transcendence.
      { id: 'bulwark', name: 'Bulwark', icon: 'health', max: 99, cost: 6, key: 'hpMul', mode: 'mul', per: 0.10 },
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
      { id: 'forager',   name: 'Forager',   icon: 'pick',  max: 1,  cost: 12, key: 'autoSwitch', mode: 'add', per: 1 },
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

// --- soul tree (awakening) ------------------------------------------
// The top layer. Souls are roughly an order of magnitude scarcer than relics,
// so the nodes are few, deep and expensive, and every one of them is a
// multiplier the relic tree cannot reach. This tree is the only thing besides
// the Skills tab that an awakening does not touch.
export const SOUL_TREE = [
  {
    id: 'ascendant', name: 'Ascendant', accent: '#c79ae8',
    nodes: [
      { id: 'soulfire',   name: 'Soulfire',   icon: 'torch',        max: 6, cost: 1, key: 'dmgMul',       mode: 'mul', per: 0.40 },
      { id: 'rend',       name: 'Rend',       icon: 'dagger',       max: 5, cost: 2, key: 'critAdd',      mode: 'add', per: 0.05 },
      { id: 'annihilate', name: 'Annihilate', icon: 'crit_power',   max: 5, cost: 2, key: 'critPowerAdd', mode: 'add', per: 0.70 },
      { id: 'cataclysm',  name: 'Cataclysm',  icon: 'attack_speed', max: 4, cost: 3, key: 'atkSpeedMul',  mode: 'mul', per: 0.15 },
      // The rail. Every other soul node runs out, and the audit showed
      // what follows: the Soul Echo pays ever more souls with nowhere to
      // go. This one never fills, and soulCost's cost+ranks curve makes
      // each rank dearer than the last, a quadratic sink for a linearly
      // growing income. That pairing is the whole endgame pace.
      { id: 'transcend', name: 'Transcendence', icon: 'orb', max: 99, cost: 4, key: 'dmgMul', mode: 'mul', per: 0.12 },
    ],
  },
  {
    id: 'eternity', name: 'Eternity', accent: '#6dba79',
    nodes: [
      { id: 'memory',      name: 'Memory',       icon: 'crown',  max: 5, cost: 2, key: 'startStage',  mode: 'add',  per: 3 },
      { id: 'bloodline',   name: 'Bloodline',    icon: 'book',   max: 5, cost: 2, key: 'extraPoints', mode: 'add',  per: 2 },
      { id: 'aegis',       name: 'Aegis',        icon: 'shield', max: 5, cost: 3, key: 'damageTaken', mode: 'less', per: 0.05 },
      { id: 'eternalHour', name: 'Eternal Hour', icon: 'boss',   max: 4, cost: 2, key: 'bossTime',    mode: 'add',  per: 8 },
      // Transcendence's shieldmate: the enemy's damage climbs the same
      // curve its health does, so an uncapped damage rail without an
      // uncapped health rail just relocates the wall.
      { id: 'undying', name: 'Undying', icon: 'health', max: 99, cost: 4, key: 'hpMul', mode: 'mul', per: 0.12 },
    ],
  },
  {
    id: 'dominion', name: 'Dominion', accent: '#ebb85b',
    nodes: [
      { id: 'avarice',  name: 'Avarice',  icon: 'gold',  max: 6, cost: 1, key: 'goldMul',   mode: 'mul', per: 0.45 },
      { id: 'epiphany', name: 'Epiphany', icon: 'orb',   max: 5, cost: 1, key: 'xpMul',     mode: 'mul', per: 0.40 },
      { id: 'hoard',    name: 'Hoard',    icon: 'dust',  max: 5, cost: 2, key: 'dustMul',   mode: 'mul', per: 0.40 },
      { id: 'conquest', name: 'Conquest', icon: 'scout', max: 3, cost: 3, key: 'killsLess', mode: 'add', per: 1 },
    ],
  },
  // The two branches that reach systems no other tree can touch: the pets
  // at your heel and the whole gathering economy at once.
  {
    id: 'menagerie', name: 'Menagerie', accent: '#e67a84',
    nodes: [
      { id: 'packLeader',   name: 'Pack Leader',    icon: 'crown', max: 6, cost: 2, key: 'petPower', mode: 'add',  per: 0.15 },
      { id: 'keepersTable', name: "Keeper's Table", icon: 'fish',  max: 4, cost: 2, key: 'feedLess', mode: 'less', per: 0.10 },
    ],
  },
  {
    id: 'harvest', name: 'Harvest', accent: '#6dba79',
    nodes: [
      { id: 'greenThumb', name: 'Green Thumb', icon: 'ore', max: 6, cost: 2, key: 'yieldAll', mode: 'add',  per: 0.10 },
      { id: 'quickHands', name: 'Quick Hands', icon: 'axe', max: 4, cost: 2, key: 'workAll',  mode: 'less', per: 0.08 },
    ],
  },
];

/** What a node does at a given number of points. */
export function describeNode(node, ranks) {
  const n = Math.max(1, ranks); // with no points yet, show what the first buys
  const total = node.per * n;
  switch (node.key) {
    case 'critAdd':      return t('+{0} crit chance', pct(total));
    case 'critPowerAdd': return t('+{0} crit damage', total.toFixed(2));
    case 'startStage':   return t('start at stage {0}', 1 + total);
    case 'killsLess':    return t('{0} fewer mob per stage', total);
    case 'extraPoints':  return t('+{0} skill point', total);
    case 'damageTaken':  return t('{0} less damage taken', pct(total));
    case 'respawnMul':   return t('{0} faster to get up', pct(total));
    case 'dustChance':   return t('+{0} dust chance', pct(total));
    case 'bossTime':     return t('+{0}s on the boss timer', total);
    case 'autoBuy':      return t('buys for you every {0}s', (AUTO_BUY_BASE - n + 1).toFixed(0));
    case 'autoCraft':    return t('forges for you when dust piles up');
    case 'autoSwitch':   return t('swaps your tool every {0}s so no skill stalls', AUTO_SWITCH_EVERY);
    case 'doubleHit':    return t('+{0} chance to strike twice', pct(total));
    case 'lifesteal':    return t('heals {0} of damage dealt', pct(total));
    case 'executeMul':   return t('+{0} damage below 30% health', pct(total));
    case 'ambush':       return t('+{0} on the first hit on each enemy', pct(total));
    case 'petPower':     return t('pet buffs +{0} stronger', pct(total));
    case 'feedLess':     return t('pets eat {0} less fish', pct(total));
    case 'yieldAll':     return t('+{0} yield, every gathering skill', pct(total));
    case 'workAll':      return t('{0} faster work, every gathering skill', pct(total));
    case 'frenzy':       return t('+{0} attack speed per kill, up to {1} in a row',
      pct(total), FRENZY_CAP);
    case 'thorns':       return t('throws {0} of the damage you take back', pct(total));
    case 'treasure':     return t('+{0} chance a kill pays double gold', pct(total));
    default:             return `${mult(1 + total)} ${t(LABEL[node.key] ?? '')}`.trim();
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

/** A keystone: shut until the node before it is FULL, not merely started. */
export function isKeystone(node) {
  return node.needs === 'max';
}

/** Relic cost to take a node from `ranks` to `ranks + 1`. */
export function relicCost(node, ranks) {
  return node.cost + ranks;
}

/** Soul cost to take a node from `ranks` to `ranks + 1`. Same ramp as relics;
 *  the nodes are shallower instead, because souls come in ones and twos. */
export function soulCost(node, ranks) {
  return node.cost + ranks;
}
