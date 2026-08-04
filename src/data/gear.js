import { pct, mult } from '../format.js';
import { t } from '../i18n.js';

/**
 * Equipment forge, unlocked on the first rebirth.
 *
 * Only the RARITY is rolled; the stat value is fixed per rarity. That keeps
 * comparison trivial ("orange always beats purple") and lets the game swap
 * items for you with no inventory to manage.
 */

// Colours are pulled toward the Mini Medieval ramp so the rarity tint sits
// next to the pack's frames instead of fighting them.
// The ladder doubles at every step, which is what makes "orange always beats
// purple" true without anyone having to read a number.
export const RARITIES = [
  { id: 'white',  name: 'Common',    color: '#dacea4', mul: 1 },
  { id: 'green',  name: 'Uncommon',  color: '#6dba79', mul: 2.2 },
  { id: 'blue',   name: 'Rare',      color: '#5aa9c9', mul: 4.5 },
  { id: 'purple', name: 'Epic',      color: '#b072c9', mul: 9 },
  { id: 'orange', name: 'Legendary', color: '#ebb85b', mul: 18 },
  { id: 'red',    name: 'Mythic',    color: '#e5493f', mul: 36 },
];

/** Legendary's index, for anything that means "the old top". */
export const LEGENDARY = RARITIES.findIndex((r) => r.id === 'orange');

/**
 * Roll weights, same order as the rarities. They add up to 1.
 *
 * Mythic sits at 1 in 5000 from a forge with no Smithing behind it, and
 * about 1 in 200 with the tree maxed, because `rarityOdds` moves mass up the
 * ladder geometrically and Mythic is the rung that gains most from it. That
 * is deliberately a long chase rather than an impossible one: the Mythic
 * Chest sells the same item for gems, and a shortcut is only worth buying
 * while the long way round still exists.
 */
export const RARITY_ODDS = [0.50, 0.27, 0.155, 0.0598, 0.0150, 0.0002];

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

// Wearing the whole board at one rarity or better pays a set bonus on top,
// indexed by the LOWEST rarity you wear. It is what the auto-forge is
// grinding toward once every slot is purple and the rolls keep missing.
export const SET_BONUS = [
  null,                                          // all Common: no prize
  { dmgMul: 0.05, hpMul: 0.05 },                 // all Uncommon+
  { dmgMul: 0.10, hpMul: 0.10 },                 // all Rare+
  { dmgMul: 0.18, hpMul: 0.18 },                 // all Epic+
  { dmgMul: 0.30, hpMul: 0.30, goldMul: 0.15 },  // all Legendary+
  { dmgMul: 0.50, hpMul: 0.50, goldMul: 0.25 },  // all Mythic
];

/** Lowest rarity worn, or null while any slot is empty. */
export function setRarity(gear) {
  let lowest = Infinity;
  for (const slot of SLOTS) {
    const r = gear[slot.id];
    if (r == null) return null;
    lowest = Math.min(lowest, r);
  }
  return lowest;
}

// Soul dust
export const DUST = {
  mobChance: 0.20,   // per regular mob
  mobAmount: 1,
  eliteAmount: 4,    // the mini boss always drops
  bossAmount: 10,    // the boss always drops
  scrapRefund: 0.3,  // returned when the roll is worse than what you wear
};

// One more rung than there are rarities to replace, so a Mythic slot still
// has a price if anything ever asks for one. Nothing should: it is the top,
// and `cheapestForgeable` skips a slot already there.
/** Dust cost to forge a slot, based on what is already equipped. */
const COST_BY_RARITY = [20, 34, 55, 90, 150, 250];
export const EMPTY_COST = 10;

export function craftCost(rarityIndex, discount = 1) {
  const base = rarityIndex == null ? EMPTY_COST : COST_BY_RARITY[rarityIndex];
  return Math.max(5, Math.round(base * discount));
}

/**
 * Odds shifted by Smithing.
 *
 * Each tier's weight is multiplied by `(1 + quality)` once per step up the
 * ladder, then the whole thing is normalised. Quality 0 gives RARITY_ODDS
 * back exactly, and any quality above that moves mass up the ladder
 * geometrically without any tier ever running past 100%, which a flat "+x%
 * legendary chance" would eventually do.
 */
export function rarityOdds(quality = 0) {
  if (quality <= 0) return RARITY_ODDS.slice();
  const weights = RARITY_ODDS.map((w, i) => w * Math.pow(1 + quality, i));
  const total = weights.reduce((a, c) => a + c, 0);
  return weights.map((w) => w / total);
}

/**
 * Rolls a rarity. `floor` is Smithing's Standards node: at three ranks the
 * forge simply stops producing anything below Epic.
 */
export function rollRarity(quality = 0, floor = 0, random = Math.random) {
  const odds = rarityOdds(quality);
  let r = random();
  let rolled = 0;
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r < 0) { rolled = i; break; }
  }
  return Math.max(rolled, Math.min(floor, RARITIES.length - 1));
}

/** Stat value of an item. */
export function gearValue(slot, rarityIndex) {
  return slot.per * RARITIES[rarityIndex].mul;
}

export function describeGear(slot, rarityIndex) {
  const total = gearValue(slot, rarityIndex);
  if (slot.key === 'critAdd') return t('+{0} crit chance', pct(total));
  if (slot.key === 'damageTaken') return t('{0} less damage taken', pct(total));
  return `${mult(1 + total)} ${t(GEAR_LABEL[slot.key])}`;
}

const GEAR_LABEL = {
  dmgMul: 'damage',
  hpMul: 'health',
  regenMul: 'regen',
  moveMul: 'stride',
  goldMul: 'gold',
};
