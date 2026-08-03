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

// --- awakening: the layer above rebirth ------------------------------
// Wipes the relic layer too and pays souls, each a permanent multiplier on
// damage and gold. Souls are measured against every relic the ascension has
// earned across all of its rebirths, so no rebirth is ever wasted work.

export const AWAKEN = {
  minRelics: 50,   // relics earned before the first soul pays out
  divisor: 50,
  power: 1.25,
};

/**
 * Total souls an ascension that earned `relics` has already paid.
 * Cumulative like `relicsEarnedAt`, but the counter it reads resets on every
 * awakening, so each cycle starts the climb from zero.
 */
export function soulsEarnedAt(relics) {
  if (relics < AWAKEN.minRelics) return 0;
  return Math.floor(Math.pow((relics - AWAKEN.minRelics + AWAKEN.divisor) / AWAKEN.divisor, AWAKEN.power));
}

/** Relics-earned mark where the next soul lands, starting from `earned` souls. */
export function nextSoulRelics(earned) {
  for (let r = AWAKEN.minRelics; r < 100000; r++) {
    if (soulsEarnedAt(r) > earned) return r;
  }
  return Infinity;
}
