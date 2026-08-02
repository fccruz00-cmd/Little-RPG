import { pct, mult } from '../format.js';

/**
 * Equipment forge, unlocked on the first rebirth.
 *
 * Only the RARITY is rolled; the stat value is fixed per rarity. That keeps
 * comparison trivial ("orange always beats purple") and lets the game swap
 * items for you with no inventory to manage.
 */

export const RARITIES = [
  { id: 'white',  name: 'Common',    color: '#cfc9be', mul: 1 },
  { id: 'green',  name: 'Uncommon',  color: '#7fc45a', mul: 2.2 },
  { id: 'blue',   name: 'Rare',      color: '#5fa8d3', mul: 4.5 },
  { id: 'purple', name: 'Epic',      color: '#a678d6', mul: 9 },
  { id: 'orange', name: 'Legendary', color: '#f0a63c', mul: 18 },
];

/** Roll weights, same order as the rarities. They add up to 1. */
export const RARITY_ODDS = [0.50, 0.27, 0.155, 0.06, 0.015];

// One slot, one stat. `per` is the value at Common; the other rarities
// multiply it by `RARITIES[i].mul`.
export const SLOTS = [
  { id: 'sword',  name: 'Sword',  icon: 'it_sword',  key: 'dmgMul',      mode: 'mul',  per: 0.04 },
  { id: 'helmet', name: 'Helmet', icon: 'it_helm',   key: 'hpMul',       mode: 'mul',  per: 0.05 },
  { id: 'armor',  name: 'Armor',  icon: 'it_chest',  key: 'damageTaken', mode: 'less', per: 0.01 },
  { id: 'pants',  name: 'Pants',  icon: 'it_pants',  key: 'regenMul',    mode: 'mul',  per: 0.06 },
  { id: 'boots',  name: 'Boots',  icon: 'it_boot',   key: 'moveMul',     mode: 'mul',  per: 0.03 },
  { id: 'amulet', name: 'Amulet', icon: 'it_amulet', key: 'goldMul',     mode: 'mul',  per: 0.04 },
  { id: 'ring',   name: 'Ring',   icon: 'it_ring',   key: 'critAdd',     mode: 'add',  per: 0.006 },
];

// Soul dust
export const DUST = {
  mobChance: 0.20,   // per regular mob
  mobAmount: 1,
  eliteAmount: 4,    // the mini boss always drops
  bossAmount: 10,    // the boss always drops
  scrapRefund: 0.3,  // returned when the roll is worse than what you wear
};

/** Dust cost to forge a slot, based on what is already equipped. */
const COST_BY_RARITY = [20, 34, 55, 90, 150];
export const EMPTY_COST = 10;

export function craftCost(rarityIndex) {
  return rarityIndex == null ? EMPTY_COST : COST_BY_RARITY[rarityIndex];
}

/** Rolls a rarity using the `RARITY_ODDS` weights. */
export function rollRarity(random = Math.random) {
  let r = random();
  for (let i = 0; i < RARITY_ODDS.length; i++) {
    r -= RARITY_ODDS[i];
    if (r < 0) return i;
  }
  return 0;
}

/** Stat value of an item. */
export function gearValue(slot, rarityIndex) {
  return slot.per * RARITIES[rarityIndex].mul;
}

export function describeGear(slot, rarityIndex) {
  const total = gearValue(slot, rarityIndex);
  if (slot.key === 'critAdd') return `+${pct(total)} crit chance`;
  if (slot.key === 'damageTaken') return `${pct(total)} less damage taken`;
  return `${mult(1 + total)} ${GEAR_LABEL[slot.key]}`;
}

const GEAR_LABEL = {
  dmgMul: 'damage',
  hpMul: 'health',
  regenMul: 'regen',
  moveMul: 'stride',
  goldMul: 'gold',
};
