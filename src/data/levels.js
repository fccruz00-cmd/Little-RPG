// Nível do herói. Cada abate dá experiência; cada nível dá 1 ponto de
// talento. O nível não mexe em atributo nenhum sozinho — quem dá poder é a
// árvore, senão subir de nível viraria só mais uma curva escondida.

export const LEVELS = {
  xpBase: 20,     xpGrowth: 1.22,   // XP pra sair do nível n
  killXpBase: 4,  killXpGrowth: 1.11, // XP por abate, por fase
  eliteXp: 5,     bossXp: 12,       // multiplicadores do encontro final
  pointsPerLevel: 1,
};

/** XP necessária pra sair do nível `level` e chegar no seguinte. */
export function xpToNext(level) {
  return Math.ceil(LEVELS.xpBase * Math.pow(LEVELS.xpGrowth, level - 1));
}

/** XP que um abate dá numa fase. */
export function killXp(stage, mul = 1) {
  return LEVELS.killXpBase * Math.pow(LEVELS.killXpGrowth, stage - 1) * mul;
}
