import { pct, mult } from '../format.js';

/**
 * Forja de equipamentos, liberada no primeiro renascimento.
 *
 * O sorteio é só da RARIDADE — o valor do atributo é fixo por raridade, como
 * pedido. Isso mantém a comparação trivial ("laranja é sempre melhor que roxa")
 * e deixa o jogo trocar de item sozinho sem inventário nem gestão.
 */

export const RARITIES = [
  { id: 'branca',  name: 'Comum',    color: '#cfc9be', mul: 1 },
  { id: 'verde',   name: 'Incomum',  color: '#7fc45a', mul: 2.2 },
  { id: 'azul',    name: 'Rara',     color: '#5fa8d3', mul: 4.5 },
  { id: 'roxa',    name: 'Épica',    color: '#a678d6', mul: 9 },
  { id: 'laranja', name: 'Lendária', color: '#f0a63c', mul: 18 },
];

/** Pesos do sorteio, na mesma ordem das raridades. Somam 1. */
export const RARITY_ODDS = [0.50, 0.27, 0.155, 0.06, 0.015];

// Um slot, um atributo. `per` é o valor na raridade branca; as outras
// multiplicam por `RARITIES[i].mul`.
export const SLOTS = [
  { id: 'espada',   name: 'Espada',   icon: 'it_sword',  key: 'dmgMul',      mode: 'mul',  per: 0.04 },
  { id: 'capacete', name: 'Capacete', icon: 'it_helm',   key: 'hpMul',       mode: 'mul',  per: 0.05 },
  { id: 'armadura', name: 'Armadura', icon: 'it_chest',  key: 'damageTaken', mode: 'less', per: 0.01 },
  { id: 'calca',    name: 'Calça',    icon: 'it_pants',  key: 'regenMul',    mode: 'mul',  per: 0.06 },
  { id: 'bota',     name: 'Bota',     icon: 'it_boot',   key: 'moveMul',     mode: 'mul',  per: 0.03 },
  { id: 'amuleto',  name: 'Amuleto',  icon: 'it_amulet', key: 'goldMul',     mode: 'mul',  per: 0.04 },
  { id: 'anel',     name: 'Anel',     icon: 'it_ring',   key: 'critAdd',     mode: 'add',  per: 0.006 },
];

// Poeira de alma
export const DUST = {
  mobChance: 0.20,   // por mob comum
  mobAmount: 1,
  eliteAmount: 4,    // mini-chefe sempre dropa
  bossAmount: 10,    // chefe sempre dropa
  scrapRefund: 0.3,  // devolvido quando o item sorteado é pior que o equipado
};

/** Custo em poeira pra forjar num slot, pelo que já está equipado. */
const COST_BY_RARITY = [20, 34, 55, 90, 150];
export const EMPTY_COST = 10;

export function craftCost(rarityIndex) {
  return rarityIndex == null ? EMPTY_COST : COST_BY_RARITY[rarityIndex];
}

/** Sorteia uma raridade pelos pesos de `RARITY_ODDS`. */
export function rollRarity(random = Math.random) {
  let r = random();
  for (let i = 0; i < RARITY_ODDS.length; i++) {
    r -= RARITY_ODDS[i];
    if (r < 0) return i;
  }
  return 0;
}

/** Valor do atributo de um item. */
export function gearValue(slot, rarityIndex) {
  return slot.per * RARITIES[rarityIndex].mul;
}

export function describeGear(slot, rarityIndex) {
  const total = gearValue(slot, rarityIndex);
  if (slot.key === 'critAdd') return `+${pct(total)} de crítico`;
  if (slot.key === 'damageTaken') return `−${pct(total)} de dano recebido`;
  return `${mult(1 + total)} ${GEAR_LABEL[slot.key]}`;
}

const GEAR_LABEL = {
  dmgMul: 'de dano',
  hpMul: 'de vida',
  regenMul: 'de regeneração',
  moveMul: 'de passada',
  goldMul: 'de ouro',
};
