// Rebirth: wipes the run and turns the depth reached into relics, which buy
// the permanent tree.

export const PRESTIGE = {
  minStage: 25,   // nothing pays out before this
  divisor: 7,
  power: 1.35,
};

/**
 * Total relics a run reaching `stage` has already paid: cumulative, not
 * incremental. A rebirth grants this minus what was already collected, so
 * repeating the same depth does not pay twice.
 */
export function relicsEarnedAt(stage) {
  if (stage < PRESTIGE.minStage) return 0;
  return Math.floor(Math.pow((stage - PRESTIGE.minStage + PRESTIGE.divisor) / PRESTIGE.divisor, PRESTIGE.power));
}

/** Stage where the next relic drops, starting from `earned`. */
export function nextRelicStage(earned) {
  for (let s = PRESTIGE.minStage; s < 10000; s++) {
    if (relicsEarnedAt(s) > earned) return s;
  }
  return Infinity;
}
