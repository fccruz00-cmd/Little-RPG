import { statValue } from './balance.js';
import { fmt, pct, mult } from '../format.js';
import { t } from '../i18n.js';

// Order the upgrades show up in the shop.
export const UPGRADES = [
  {
    key: 'damage', icon: 'damage', name: 'Damage',
    describe: (lvl) => t('{0} per hit', fmt(statValue('damage', lvl))),
  },
  {
    key: 'attackRate', icon: 'attack_speed', name: 'Attack Speed',
    describe: (lvl) => t('{0} hits/s', statValue('attackRate', lvl).toFixed(2)),
  },
  {
    key: 'critChance', icon: 'crit', name: 'Crit Chance',
    describe: (lvl) => t('{0} chance', pct(statValue('critChance', lvl))),
  },
  {
    key: 'critPower', icon: 'crit_power', name: 'Crit Damage',
    describe: (lvl) => t('{0} on crits', mult(statValue('critPower', lvl))),
  },
  {
    key: 'maxHp', icon: 'health', name: 'Max Health',
    describe: (lvl) => t('{0} health', fmt(statValue('maxHp', lvl))),
  },
  {
    key: 'regen', icon: 'regen', name: 'Regeneration',
    describe: (lvl) => t('{0} health/s', fmt(statValue('regen', lvl))),
  },
  {
    key: 'moveSpeed', icon: 'stride', name: 'Stride',
    describe: (lvl) => {
      const v = statValue('moveSpeed', lvl);
      return v >= 110 ? t('maxed out') : t('{0} move speed', v.toFixed(0));
    },
  },
  {
    key: 'goldGain', icon: 'gold', name: 'Gold Gain',
    describe: (lvl) => t('{0} gold', mult(statValue('goldGain', lvl))),
  },
  // --- the second shelf: things that change the fight, not its size ---
  {
    key: 'armor', icon: 'shield', name: 'Armor',
    describe: (lvl) => t('{0} less damage taken', pct(statValue('armor', lvl))),
  },
  {
    key: 'lifesteal', icon: 'regen', name: 'Lifesteal',
    describe: (lvl) => t('heals {0} of damage dealt', pct(statValue('lifesteal', lvl))),
  },
  {
    key: 'ferocity', icon: 'bolt', name: 'Ferocity',
    describe: (lvl) => t('+{0} chance to strike twice', pct(statValue('ferocity', lvl))),
  },
  {
    key: 'insight', icon: 'book', name: 'Insight',
    describe: (lvl) => t('{0} XP', mult(statValue('insight', lvl))),
  },
  // --- the rebirth shelf: opens with the first rebirth ---
  {
    key: 'bossDamage', icon: 'boss', name: 'Giant Slayer',
    describe: (lvl) => t('+{0} damage to bosses and mini bosses', pct(statValue('bossDamage', lvl))),
  },
  {
    key: 'thorns', icon: 'shield', name: 'Barbs',
    describe: (lvl) => t('throws {0} of the damage you take back', pct(statValue('thorns', lvl))),
  },
  {
    key: 'overkill', icon: 'crit_power', name: 'Overkill',
    describe: (lvl) => t('{0} of overkill damage hits the next enemy', pct(statValue('overkill', lvl))),
  },
  {
    key: 'dustFind', icon: 'dust', name: 'Dust Magnet',
    describe: (lvl) => t('+{0} dust chance', pct(statValue('dustFind', lvl))),
  },
  {
    key: 'respawn', icon: 'regen', name: 'Second Wind',
    describe: (lvl) => t('{0} faster to get up', pct(statValue('respawn', lvl))),
  },
  {
    key: 'warChest', icon: 'bag', name: 'War Chest',
    describe: (lvl) => t('+{0} gold from bosses and mini bosses', pct(statValue('warChest', lvl))),
  },
  // --- the awakened shelf: opens with the first awakening ---
  {
    key: 'might', icon: 'torch', name: 'Ascendant Might',
    describe: (lvl) => t('+{0} damage and health', pct(statValue('might', lvl))),
  },
  {
    key: 'reap', icon: 'dagger', name: 'Reap',
    describe: (lvl) => t('slays non-bosses below {0} health', pct(statValue('reap', lvl))),
  },
  {
    key: 'phoenix', icon: 'health', name: 'Phoenix Heart',
    describe: (lvl) => t('{0} chance to survive a killing blow', pct(statValue('phoenix', lvl))),
  },
];
