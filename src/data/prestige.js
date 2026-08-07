// Rebirth: wipes the run and turns the depth reached into relics, which buy
// the permanent tree.

export const PRESTIGE = {
  minStage: 25,   // nothing pays out before this
  divisor: 7,
  power: 1.35,
  // The Relic Echo, the rebirth-sized twin of the Soul Echo below: every
  // rebirth already taken THIS CYCLE lifts later payouts by a quarter of
  // the base. Rebirth number six pays noticeably better than number one at
  // the same depth, so taking another one is always worth something -- and
  // since souls are measured against the cycle's relics, a cycle of eager
  // rebirths feeds the awakening too. Awakening resets `prestiges` and the
  // echo with it: each ascension earns its own momentum.
  echo: 0.25,
};

/**
 * Total relics a run reaching `stage` has already paid, for a save with
 * `prestiges` rebirths behind it this cycle: cumulative, not incremental.
 * A rebirth grants this minus what was already collected, so repeating
 * the same depth does not pay twice -- though with the echo, the same
 * depth IS worth more each time the counter climbs.
 */
export function relicsEarnedAt(stage, prestiges = 0) {
  if (stage < PRESTIGE.minStage) return 0;
  const base = Math.pow((stage - PRESTIGE.minStage + PRESTIGE.divisor) / PRESTIGE.divisor, PRESTIGE.power);
  return Math.floor(base * (1 + PRESTIGE.echo * prestiges));
}

/** Stage where the next relic drops, starting from `earned`. */
export function nextRelicStage(earned, prestiges = 0) {
  for (let s = PRESTIGE.minStage; s < 10000; s++) {
    if (relicsEarnedAt(s, prestiges) > earned) return s;
  }
  return Infinity;
}

// --- awakening: the layer above rebirth ------------------------------
// Wipes the relic layer too and pays souls, each a permanent multiplier on
// damage and gold. Souls are measured against every relic the ascension has
// earned across all of its rebirths, so no rebirth is ever wasted work.

// The Singularity: the third door, and the first that is not a wipe. It
// asks for three lifetime awakenings, opens once, and what it opens is
// the sky: the Planetarium, the Constellations and the Omniscience marks
// all live past it. A ceremony, not a cycle.
export const SINGULARITY = {
  needsAwakens: 3,
};

export const AWAKEN = {
  minRelics: 50,   // relics earned before the first soul pays out
  divisor: 50,
  power: 1.25,
  // The Soul Echo. Without it the loop was a flat circle: the reachable
  // depth fixed the relics, the relics fixed the souls, and the souls were
  // too few to move the depth -- a 72h bot audit froze at the same record
  // from hour 8 to hour 72, +5 souls per identical 7h cycle. Each awakening
  // already taken now raises every later payout by half its base, so the
  // cycles climb instead of repeating. The FIRST awakening is untouched:
  // echo pays for history, and a new ascendant has none.
  echo: 0.5,
};

/**
 * Total souls an ascension that earned `relics` has already paid, for a
 * save with `awakens` awakenings behind it. Cumulative like
 * `relicsEarnedAt`, but the counter it reads resets on every awakening, so
 * each cycle starts the climb from zero -- with the echo lifting the whole
 * curve a step per cycle completed.
 */
export function soulsEarnedAt(relics, awakens = 0) {
  if (relics < AWAKEN.minRelics) return 0;
  const base = Math.pow((relics - AWAKEN.minRelics + AWAKEN.divisor) / AWAKEN.divisor, AWAKEN.power);
  return Math.floor(base * (1 + AWAKEN.echo * awakens));
}

/** Relics-earned mark where the next soul lands, starting from `earned` souls. */
export function nextSoulRelics(earned, awakens = 0) {
  for (let r = AWAKEN.minRelics; r < 100000; r++) {
    if (soulsEarnedAt(r, awakens) > earned) return r;
  }
  return Infinity;
}
