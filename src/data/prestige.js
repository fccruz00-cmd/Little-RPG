// Renascimento: zera a corrida e converte a profundidade alcançada em
// relíquias, que compram a árvore permanente.

export const PRESTIGE = {
  minStage: 25,   // antes disso não rende nada
  divisor: 7,
  power: 1.35,
};

/**
 * Total de relíquias que uma corrida até `stage` já pagou — acumulado, não
 * incremental. O ganho de um renascimento é isto menos o que já foi recebido,
 * então repetir a mesma profundidade não rende de novo.
 */
export function relicsEarnedAt(stage) {
  if (stage < PRESTIGE.minStage) return 0;
  return Math.floor(Math.pow((stage - PRESTIGE.minStage + PRESTIGE.divisor) / PRESTIGE.divisor, PRESTIGE.power));
}

/** Em que fase cai a próxima relíquia, a partir de `earned`. */
export function nextRelicStage(earned) {
  for (let s = PRESTIGE.minStage; s < 10000; s++) {
    if (relicsEarnedAt(s) > earned) return s;
  }
  return Infinity;
}
