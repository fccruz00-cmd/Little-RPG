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
];
