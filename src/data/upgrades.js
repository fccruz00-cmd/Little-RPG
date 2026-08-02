import { statValue } from './balance.js';
import { fmt, pct, mult } from '../format.js';

// Order the upgrades show up in the shop.
export const UPGRADES = [
  {
    key: 'damage', icon: 'damage', name: 'Damage',
    describe: (lvl) => `${fmt(statValue('damage', lvl))} per hit`,
  },
  {
    key: 'attackRate', icon: 'attack_speed', name: 'Attack Speed',
    describe: (lvl) => `${statValue('attackRate', lvl).toFixed(2)} hits/s`,
  },
  {
    key: 'critChance', icon: 'crit', name: 'Crit Chance',
    describe: (lvl) => `${pct(statValue('critChance', lvl))} chance`,
  },
  {
    key: 'critPower', icon: 'crit_power', name: 'Crit Damage',
    describe: (lvl) => `${mult(statValue('critPower', lvl))} on crits`,
  },
  {
    key: 'maxHp', icon: 'health', name: 'Max Health',
    describe: (lvl) => `${fmt(statValue('maxHp', lvl))} health`,
  },
  {
    key: 'regen', icon: 'regen', name: 'Regeneration',
    describe: (lvl) => `${fmt(statValue('regen', lvl))} health/s`,
  },
  {
    key: 'moveSpeed', icon: 'stride', name: 'Stride',
    describe: (lvl) => {
      const v = statValue('moveSpeed', lvl);
      return v >= 110 ? 'maxed out' : `${v.toFixed(0)} move speed`;
    },
  },
  {
    key: 'goldGain', icon: 'gold', name: 'Gold Gain',
    describe: (lvl) => `${mult(statValue('goldGain', lvl))} gold`,
  },
];
