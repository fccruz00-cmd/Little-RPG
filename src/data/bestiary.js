// The Bestiary: a kill ledger per species, and the grudge it pays.
//
// Every kill is counted under the name of the thing that died, lifetime,
// through every reset, exactly like the Omniscience ledger counts piles.
// Notches work the same way too: one per power of ten past the species'
// base, and each notch pays damage AGAINST THAT SPECIES ONLY. The tally
// runs from the first kill; the damage folds once the first awakening
// opens the eye, because a grudge this precise is singularity knowledge.
//
// Bosses notch from ten kills, not a hundred: they die two orders of
// magnitude rarer, and a ledger nobody can fill is a wall, not a book.

import { MOBS, BOSSES } from './enemies.js';

export const BESTIARY = {
  mobBase: 100,   // kills for a mob's first notch
  bossBase: 10,   // a boss dies rarer; its first notch honours that
  cap: 10,
  per: 0.06,      // damage vs that species per notch
};

/** Notches a species' tally has earned: 0 below base, +1 per power of ten. */
export function huntTier(kills, base) {
  if (!kills || kills < base) return 0;
  return Math.min(BESTIARY.cap, Math.floor(Math.log10(kills / base)) + 1);
}

/** The tally the NEXT notch asks for, or null at the ceiling. */
export function huntNext(kills, base) {
  const tier = huntTier(kills, base);
  if (tier >= BESTIARY.cap) return null;
  return base * Math.pow(10, tier);
}

export const BESTIARY_ROWS = [
  ...MOBS.map((m) => ({ id: m.id, name: m.name, base: BESTIARY.mobBase, boss: false })),
  ...BOSSES.map((b) => ({ id: b.id, name: b.name, base: BESTIARY.bossBase, boss: true })),
];

export const BESTIARY_BY_ID = Object.fromEntries(BESTIARY_ROWS.map((r) => [r.id, r]));
