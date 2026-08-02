import { pct, mult } from '../format.js';

/**
 * As duas árvores do jogo.
 *
 * Cada nó acumula num "bônus": uma chave que o `GameState` soma/multiplica em
 * cima dos atributos comprados com ouro. Um nó só libera quando o anterior do
 * mesmo galho tem pelo menos 1 ponto — é isso que dá o formato de árvore.
 *
 * `mode` diz como o bônus se acumula:
 *   'mul'  → multiplicador, 1 + per × ranks   (dano, ouro, vida…)
 *   'add'  → soma direta, per × ranks         (chance de crítico, fases…)
 *   'less' → redutor, 1 − per × ranks         (dano recebido, tempo, mobs)
 */

export const BONUS_KEYS = [
  'dmgMul', 'atkSpeedMul', 'critAdd', 'critPowerAdd', 'hpMul', 'regenMul',
  'goldMul', 'xpMul', 'moveMul', 'damageTaken', 'respawnMul', 'killsLess',
  'startStage', 'extraPoints',
  // forja e automação
  'dustChance', 'dustMul', 'bossTime', 'autoBuy', 'autoCraft',
  // skills de combate
  'doubleHit', 'lifesteal', 'executeMul', 'ambush',
];

// ── árvore de talentos (pontos de nível) ────────────────────────────
export const TALENT_TREE = [
  {
    id: 'furia', name: 'Fúria', accent: '#d9534f',
    nodes: [
      { id: 'gume',        name: 'Gume',          icon: 'damage',       max: 10, key: 'dmgMul',      mode: 'mul',  per: 0.06 },
      { id: 'pressa',      name: 'Pressa',        icon: 'attack_speed', max: 8, key: 'atkSpeedMul', mode: 'mul',  per: 0.04 },
      { id: 'precisao',    name: 'Precisão',      icon: 'crit',         max: 5, key: 'critAdd',     mode: 'add',  per: 0.02 },
      { id: 'carnificina', name: 'Carnificina',   icon: 'crit_power',   max: 5, key: 'critPowerAdd',mode: 'add',  per: 0.25 },
    ],
  },
  {
    id: 'guarda', name: 'Guarda', accent: '#5fa8d3',
    nodes: [
      { id: 'couro',   name: 'Couro Curtido', icon: 'health', max: 10, key: 'hpMul',       mode: 'mul',  per: 0.08 },
      { id: 'folego',  name: 'Fôlego',        icon: 'regen',  max: 8, key: 'regenMul',    mode: 'mul',  per: 0.12 },
      { id: 'casco',   name: 'Casco',         icon: 'shield', max: 5, key: 'damageTaken', mode: 'less', per: 0.03 },
      { id: 'reerguer',name: 'Reerguer',      icon: 'orb',    max: 3, key: 'respawnMul',  mode: 'less', per: 0.20 },
    ],
  },
  {
    id: 'fortuna', name: 'Fortuna', accent: '#f0a63c',
    nodes: [
      { id: 'bolso',   name: 'Bolso Fundo', icon: 'gold',   max: 10, key: 'goldMul',   mode: 'mul', per: 0.08 },
      { id: 'saber',   name: 'Saber',       icon: 'book',   max: 8, key: 'xpMul',     mode: 'mul', per: 0.08 },
      { id: 'passada', name: 'Passada',     icon: 'stride', max: 5, key: 'moveMul',   mode: 'mul', per: 0.06 },
      { id: 'batedor', name: 'Batedor',     icon: 'scout',  max: 3, key: 'killsLess', mode: 'add', per: 1 },
    ],
  },
];

// ── árvore de prestígio (relíquias) ─────────────────────────────────
// Sobrevive ao renascimento. `cost` é o preço do primeiro ponto; cada ponto
// seguinte custa um a mais.
export const RELIC_TREE = [
  {
    id: 'poder', name: 'Poder', accent: '#d9534f',
    nodes: [
      { id: 'legado',      name: 'Legado',       icon: 'torch',        max: 15, cost: 1, key: 'dmgMul',       mode: 'mul', per: 0.15 },
      { id: 'furiaAntiga', name: 'Fúria Antiga', icon: 'attack_speed', max: 8,  cost: 3, key: 'atkSpeedMul',  mode: 'mul', per: 0.05 },
      { id: 'golpeMortal', name: 'Golpe Mortal', icon: 'dagger',       max: 6,  cost: 4, key: 'critAdd',      mode: 'add', per: 0.05 },
      { id: 'ira',         name: 'Ira',          icon: 'crit_power',   max: 8,  cost: 5, key: 'critPowerAdd', mode: 'add', per: 0.4 },
    ],
  },
  {
    id: 'riqueza', name: 'Riqueza', accent: '#f0a63c',
    nodes: [
      { id: 'cofre',     name: 'Cofre',     icon: 'bag',   max: 15, cost: 1, key: 'goldMul',    mode: 'mul',  per: 0.20 },
      { id: 'sabedoria', name: 'Sabedoria', icon: 'book',  max: 12, cost: 2, key: 'xpMul',      mode: 'mul',  per: 0.20 },
      { id: 'heranca',   name: 'Herança',   icon: 'crown', max: 12, cost: 3, key: 'startStage', mode: 'add',  per: 2 },
      { id: 'atalho',    name: 'Atalho',    icon: 'scout', max: 4,  cost: 8, key: 'killsLess',  mode: 'add',  per: 1 },
    ],
  },
  {
    id: 'essencia', name: 'Essência', accent: '#8bc34a',
    nodes: [
      { id: 'vigor',    name: 'Vigor',    icon: 'shield', max: 15, cost: 1, key: 'hpMul',       mode: 'mul',  per: 0.20 },
      { id: 'alma',     name: 'Alma',     icon: 'orb',    max: 12, cost: 2, key: 'regenMul',    mode: 'mul',  per: 0.25 },
      { id: 'imortal',  name: 'Imortal',  icon: 'health', max: 8,  cost: 4, key: 'damageTaken', mode: 'less', per: 0.04 },
      { id: 'veterano', name: 'Veterano', icon: 'stage',  max: 8,  cost: 4, key: 'extraPoints', mode: 'add',  per: 1 },
    ],
  },
  {
    id: 'automacao', name: 'Automação', accent: '#5fa8d3',
    nodes: [
      { id: 'arauto',  name: 'Arauto',   icon: 'gear',  max: 5,  cost: 3, key: 'autoBuy',    mode: 'add', per: 1 },
      { id: 'coletor', name: 'Coletor',  icon: 'dust',  max: 10, cost: 2, key: 'dustChance', mode: 'add', per: 0.04 },
      { id: 'moedor',  name: 'Moedor',   icon: 'bag',   max: 10, cost: 3, key: 'dustMul',    mode: 'mul', per: 0.25 },
      { id: 'bigorna', name: 'Bigorna',  icon: 'stage', max: 1,  cost: 15, key: 'autoCraft', mode: 'add', per: 1 },
    ],
  },
  {
    id: 'skills', name: 'Skills', accent: '#e0c341',
    nodes: [
      { id: 'golpeDuplo', name: 'Golpe Duplo', icon: 'bolt',       max: 10, cost: 2, key: 'doubleHit',  mode: 'add', per: 0.04 },
      { id: 'sedeSangue', name: 'Sede de Sangue', icon: 'regen',   max: 10, cost: 3, key: 'lifesteal',  mode: 'add', per: 0.01 },
      { id: 'execucao',   name: 'Execução',    icon: 'dagger',     max: 8,  cost: 4, key: 'executeMul', mode: 'add', per: 0.20 },
      { id: 'emboscada',  name: 'Emboscada',   icon: 'crit',       max: 8,  cost: 4, key: 'ambush',     mode: 'add', per: 0.30 },
    ],
  },
  {
    id: 'tempo', name: 'Tempo', accent: '#a678d6',
    nodes: [
      { id: 'folga',    name: 'Folga',     icon: 'boss',   max: 6,  cost: 3, key: 'bossTime',   mode: 'add',  per: 5 },
      { id: 'levantar', name: 'Levantar',  icon: 'orb',    max: 4,  cost: 4, key: 'respawnMul', mode: 'less', per: 0.20 },
      { id: 'marcha',   name: 'Marcha',    icon: 'stride', max: 8,  cost: 2, key: 'moveMul',    mode: 'mul',  per: 0.10 },
    ],
  },
];

/** Texto do efeito de um nó num certo número de pontos. */
export function describeNode(node, ranks) {
  const n = Math.max(1, ranks); // sem pontos ainda, mostra o que o 1º ponto dá
  const total = node.per * n;
  switch (node.key) {
    case 'critAdd':      return `+${pct(total)} de crítico`;
    case 'critPowerAdd': return `+${total.toFixed(2)} no crítico`;
    case 'startStage':   return `começa na fase ${1 + total}`;
    case 'killsLess':    return `−${total} mob por fase`;
    case 'extraPoints':  return `+${total} ponto de talento`;
    case 'damageTaken':  return `−${pct(total)} de dano recebido`;
    case 'respawnMul':   return `−${pct(total)} pra levantar`;
    case 'dustChance':   return `+${pct(total)} de chance de poeira`;
    case 'bossTime':     return `+${total}s no prazo do chefe`;
    case 'autoBuy':      return `compra sozinho a cada ${(AUTO_BUY_BASE - n + 1).toFixed(0)}s`;
    case 'autoCraft':    return 'forja sozinho quando sobra poeira';
    case 'doubleHit':    return `+${pct(total)} de chance de bater duas vezes`;
    case 'lifesteal':    return `cura ${pct(total)} do dano causado`;
    case 'executeMul':   return `+${pct(total)} de dano abaixo de 30% de vida`;
    case 'ambush':       return `+${pct(total)} no primeiro golpe em cada inimigo`;
    default:             return `${mult(1 + total)} ${LABEL[node.key] ?? ''}`.trim();
  }
}

/** Segundos entre compras automáticas no 1º ponto de Arauto. */
export const AUTO_BUY_BASE = 6;

const LABEL = {
  dmgMul: 'de dano',
  dustMul: 'de poeira',
  atkSpeedMul: 'de vel. de ataque',
  hpMul: 'de vida',
  regenMul: 'de regeneração',
  goldMul: 'de ouro',
  xpMul: 'de XP',
  moveMul: 'de passada',
};

/** Custo em relíquias pra levar um nó de `ranks` para `ranks + 1`. */
export function relicCost(node, ranks) {
  return node.cost + ranks;
}
