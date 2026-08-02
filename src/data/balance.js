// Todas as curvas numéricas do jogo ficam aqui — é o único arquivo que
// precisa ser mexido pra rebalancear.

// ── inimigos ────────────────────────────────────────────────────────
export const ENEMY = {
  hpBase: 8,      hpGrowth: 1.208,   // vida por fase
  dmgBase: 3.2,   dmgGrowth: 1.15,  // dano por fase
  goldBase: 4.5,  goldGrowth: 1.20, // ouro por abate
  bossHp: 12,     bossGold: 14,     // multiplicadores do chefe
  attackPeriod: 1.9,                // segundos entre golpes do inimigo
  bossAttackPeriod: 1.5,
};

export const BOSS_TIME = 30;        // segundos pra derrubar o chefe

export function enemyHp(stage, mul = 1) {
  return ENEMY.hpBase * Math.pow(ENEMY.hpGrowth, stage - 1) * mul;
}
export function enemyDamage(stage, mul = 1) {
  return ENEMY.dmgBase * Math.pow(ENEMY.dmgGrowth, stage - 1) * mul;
}
export function enemyGold(stage, mul = 1) {
  return ENEMY.goldBase * Math.pow(ENEMY.goldGrowth, stage - 1) * mul;
}

// ── herói ───────────────────────────────────────────────────────────
// Cada upgrade tem: valor(lvl) e custo(lvl). `lvl` começa em 0.
//
// Só `damage`, `maxHp` e `regen` crescem sem teto — são os trilhos
// exponenciais que acompanham a curva das fases. Todo o resto tem `cap`,
// senão os multiplicadores se somam e o herói passa a matar tudo em um
// golpe por volta da fase 25 (o ganho de ouro em especial se
// realimentava: mais ouro → mais ouro).
export const STATS = {
  damage:    { base: 6,    growth: 1.115, cost: 15,  costGrowth: 1.130 },
  attackRate:{ base: 0.85, growth: 1.038, cost: 45,  costGrowth: 1.260, cap: 5 },
  critChance:{ base: 0.03, step: 0.014,   cost: 90,  costGrowth: 1.300, cap: 0.5 },
  critPower: { base: 1.6,  step: 0.08,    cost: 140, costGrowth: 1.300, cap: 6 },
  maxHp:     { base: 70,   growth: 1.125, cost: 25,  costGrowth: 1.135 },
  regen:     { base: 1.5,  growth: 1.140, cost: 55,  costGrowth: 1.170 },
  goldGain:  { base: 1,    step: 0.05,    cost: 200, costGrowth: 1.320, cap: 3 },
  moveSpeed: { base: 34,   step: 3.2,     cost: 70,  costGrowth: 1.280, cap: 110 },
};

/** Valor de um atributo num certo nível. */
export function statValue(key, lvl) {
  const s = STATS[key];
  const v = s.growth != null
    ? s.base * Math.pow(s.growth, lvl)
    : s.base + s.step * lvl;
  return s.cap != null ? Math.min(s.cap, v) : v;
}

/** Último nível útil de um atributo com teto (Infinity se não tiver). */
export function statMaxLevel(key) {
  const s = STATS[key];
  if (s.cap == null) return Infinity;
  return s.growth != null
    ? Math.ceil(Math.log(s.cap / s.base) / Math.log(s.growth))
    : Math.ceil((s.cap - s.base) / s.step);
}

/** Custo pra comprar o próximo nível (sair de `lvl` para `lvl + 1`). */
export function statCost(key, lvl) {
  const s = STATS[key];
  return Math.ceil(s.cost * Math.pow(s.costGrowth, lvl));
}

/**
 * Custo de comprar `n` níveis de uma vez (soma da PG).
 */
export function statCostBulk(key, lvl, n) {
  const s = STATS[key];
  const r = s.costGrowth;
  return Math.ceil(s.cost * Math.pow(r, lvl) * (Math.pow(r, n) - 1) / (r - 1));
}

/**
 * Quantos níveis dá pra comprar com `gold` a partir de `lvl`.
 * Inverte a soma da PG e depois corrige o arredondamento.
 */
export function affordableLevels(key, lvl, gold) {
  const s = STATS[key];
  const room = statMaxLevel(key) - lvl;
  if (room <= 0) return 0;
  const r = s.costGrowth;
  const first = s.cost * Math.pow(r, lvl);
  if (gold < first) return 0;
  let n = Math.floor(Math.log(1 + (gold * (r - 1)) / first) / Math.log(r));
  while (n > 0 && statCostBulk(key, lvl, n) > gold) n--;
  while (statCostBulk(key, lvl, n + 1) <= gold) n++;
  return Math.min(n, room);
}

// ── ocioso ──────────────────────────────────────────────────────────
export const OFFLINE = {
  maxHours: 8,    // teto de tempo contabilizado
  rate: 0.5,      // eficiência do ganho enquanto o jogo está fechado
};
