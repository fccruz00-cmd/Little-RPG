// Expeditions: work for the twenty-one pets that do not walk with you.
//
// One pet follows the hero; the rest were pure passive buffs, tamed and
// then never touched again. An expedition is their job: pick a pet, pick a
// road, and it is gone for a stretch of GAME time and comes back carrying
// something. Nothing is risked and nothing is lost, because a pet that can
// die is a pet you stop sending, and this game does not take things back.
//
// The three lengths exist so the system fits both kinds of session: a short
// hop for someone watching, a long haul for someone closing the tab. Longer
// roads pay a better rate, which is the whole reason to plan before you
// leave.
//
// What a trip pays scales with the pet's LEVEL and its ARMOR, so the two
// things you were already feeding and forging now have a second use.

export const EXPEDITIONS = {
  // Trips a save can have out at once. The first is free; the rest are
  // earned by waking ancestors, which is a counter the endgame already
  // grows and nothing else spends.
  baseSlots: 1,
  slotPerSpirits: 2,   // one more slot per this many spirits awake
  maxSlots: 5,
};

/** How long a road takes, and what it multiplies. */
export const TRIPS = [
  { id: 'short', name: 'a short hop', minutes: 10, rate: 1.00 },
  { id: 'long',  name: 'a long haul', minutes: 60, rate: 1.35 },
  { id: 'deep',  name: 'the deep road', minutes: 240, rate: 1.80 },
];

export const TRIP_BY_ID = Object.fromEntries(TRIPS.map((t) => [t.id, t]));

/**
 * Where a pet can be sent. `skill` roads pay that line's RAW resource, at
 * the best tier the pet is strong enough to reach; the ruins pay dust,
 * which the forge and the hall both eat.
 */
export const ROADS = [
  { id: 'mine',   name: 'the old mine',   icon: 'pick', skill: 'mining',   per: 9 },
  { id: 'grove',  name: 'the deep grove', icon: 'axe',  skill: 'chopping', per: 9 },
  { id: 'shore',  name: 'the far shore',  icon: 'rod',  skill: 'fishing',  per: 9 },
  { id: 'fields', name: 'the wild fields',icon: 'hoe',  skill: 'farming',  per: 9 },
  { id: 'ruins',  name: 'the still ruins',icon: 'dust', dust: 0.5 },
];

export const ROAD_BY_ID = Object.fromEntries(ROADS.map((r) => [r.id, r]));

/** Expedition slots a save with `spirits` ancestors awake has opened. */
export function slotsFor(spirits) {
  return Math.min(EXPEDITIONS.maxSlots,
    EXPEDITIONS.baseSlots + Math.floor(spirits / EXPEDITIONS.slotPerSpirits));
}

/**
 * How much a trip brings home. Level is the pet's own, tier its armor:
 * both are things the player already grows, and neither is spent here.
 */
export function haul(road, trip, level, armorTier) {
  const strength = (1 + 0.12 * (level - 1)) * (1 + 0.25 * armorTier);
  const base = (road.per ?? road.dust) * trip.minutes * trip.rate;
  return Math.max(1, Math.round(base * strength));
}

/** The resource tier a pet of this level can safely reach on a line. */
export function reachFor(level) {
  return Math.min(4, Math.floor((level - 1) / 6));
}
