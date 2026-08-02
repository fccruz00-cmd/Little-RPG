import { statValue } from './balance.js';
import { fmt, pct, mult } from '../format.js';

// Ordem em que os upgrades aparecem na loja.
export const UPGRADES = [
  {
    key: 'damage', icon: 'damage', name: 'Dano',
    describe: (lvl) => `${fmt(statValue('damage', lvl))} por golpe`,
  },
  {
    key: 'attackRate', icon: 'attack_speed', name: 'Vel. de Ataque',
    describe: (lvl) => `${statValue('attackRate', lvl).toFixed(2)} golpes/s`,
  },
  {
    key: 'critChance', icon: 'crit', name: 'Crítico',
    describe: (lvl) => `${pct(statValue('critChance', lvl))} de chance`,
  },
  {
    key: 'critPower', icon: 'crit_power', name: 'Dano Crítico',
    describe: (lvl) => `${mult(statValue('critPower', lvl))} no crítico`,
  },
  {
    key: 'maxHp', icon: 'health', name: 'Vida Máxima',
    describe: (lvl) => `${fmt(statValue('maxHp', lvl))} de vida`,
  },
  {
    key: 'regen', icon: 'regen', name: 'Regeneração',
    describe: (lvl) => `${fmt(statValue('regen', lvl))} vida/s`,
  },
  {
    key: 'moveSpeed', icon: 'stride', name: 'Passada',
    describe: (lvl) => {
      const v = statValue('moveSpeed', lvl);
      return v >= 110 ? 'no máximo' : `${v.toFixed(0)} de velocidade`;
    },
  },
  {
    key: 'goldGain', icon: 'gold', name: 'Ganho de Ouro',
    describe: (lvl) => `${mult(statValue('goldGain', lvl))} de ouro`,
  },
];
