import { t } from '../i18n.js';

/**
 * The Cosmos: the layer an awakening opens above the road.
 *
 * The observatory watches one body at a time; observation is GAME time, so
 * the speed toggle turns the sky faster too. A discovered planet is
 * permanent -- it survives rebirth and awakening like the souls that paid
 * for the telescope -- and each one AUTOMATES one thing you were doing by
 * hand:
 *
 * - The four gathering planets run their line in the background at a
 *   fraction of the active rate, so a skill no longer stalls just because
 *   its tool is not in your hand. The tool slot stays meaningful: working
 *   a line yourself is still ~3x the planet's trickle.
 * - The bench planets press buttons you were pressing: re-brew a lapsing
 *   potion, re-plate a lapsing dish, claim a finished contract, refine the
 *   piles. They only ever do what a finger could -- if the materials are
 *   not there, nothing happens.
 *
 * Discovery times stretch geometrically because the list is a ladder, not
 * a checklist: the early planets pay while the late ones are still worth
 * wanting. Order is the player's own -- point the telescope wherever.
 */

export const PLANETS = [
  {
    id: 'luna', name: 'Luna', icon: 'luna', accent: '#c9c9d4',
    hours: 0.3, auto: 'skill', skill: 'fishing',
    blurb: 'the tides fish for you',
  },
  {
    id: 'mercury', name: 'Mercury', icon: 'mercury', accent: '#c8a97a',
    hours: 0.75, auto: 'contracts',
    blurb: 'the messenger claims finished contracts',
  },
  {
    id: 'venus', name: 'Venus', icon: 'venus', accent: '#ebd48a',
    hours: 1.5, auto: 'skill', skill: 'farming',
    blurb: 'the fields tend themselves',
  },
  {
    id: 'mars', name: 'Mars', icon: 'mars', accent: '#d96a4a',
    hours: 2.5, auto: 'skill', skill: 'mining',
    blurb: 'the red hills mine for you',
  },
  {
    id: 'jupiter', name: 'Jupiter', icon: 'jupiter', accent: '#e0a35c',
    hours: 4, auto: 'skill', skill: 'chopping',
    blurb: 'the giant fells wood without you stopping',
  },
  {
    id: 'saturn', name: 'Saturn', icon: 'saturn', accent: '#e6cf8f',
    hours: 6, auto: 'brews',
    blurb: 'the ringed keeper re-brews a lapsing potion',
  },
  {
    id: 'uranus', name: 'Uranus', icon: 'uranus', accent: '#9fd4d4',
    hours: 9, auto: 'dishes',
    blurb: 'the pale one re-plates a lapsing dish',
  },
  {
    id: 'neptune', name: 'Neptune', icon: 'neptune', accent: '#6a8fd6',
    hours: 13, auto: 'feed',
    blurb: 'the deep feeds the companion walking beside you',
  },
];

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

/**
 * Constellations: the second catalog, unlocked by the FIRST planet.
 *
 * They share the one telescope with the planets, which is the whole
 * decision: an hour spent charting The Sword is an hour Jupiter is not
 * being found. Where a planet automates, a constellation EMPOWERS -- four
 * reach the skills, four reach the equipment -- and a charted sky is as
 * permanent as a discovered planet.
 */
export const CONSTELLATIONS = [
  {
    id: 'sword', name: 'The Sword', icon: 'sword', accent: '#e6dccb',
    hours: 0.5, key: 'gearPower', per: 0.25,
    blurb: 'every equipped item +10% stronger',
  },
  {
    id: 'plough', name: 'The Plough', icon: 'plough', accent: '#8fbf4a',
    hours: 1, key: 'yieldAll', per: 0.20,
    blurb: '+10% yield, every gathering skill',
  },
  {
    id: 'owl', name: 'The Owl', icon: 'owl', accent: '#c9a15a',
    hours: 2, key: 'skillXp', per: 0.30,
    blurb: '+15% skill XP, every skill',
  },
  {
    id: 'anvilstars', name: 'The Anvil', icon: 'anvilstars', accent: '#e67146',
    hours: 3, key: 'forgeLuck', per: 0.50,
    blurb: 'forge odds move up the ladder',
  },
  {
    id: 'chalice', name: 'The Chalice', icon: 'chalice', accent: '#b072c9',
    hours: 5, key: 'benchPower', per: 0.25,
    blurb: 'potions and dishes +10% stronger',
  },
  {
    id: 'river', name: 'The River', icon: 'river', accent: '#5aa9c9',
    hours: 7, key: 'workAll', per: 0.16,
    blurb: '8% faster work, every gathering skill',
  },
  {
    id: 'twins', name: 'The Twins', icon: 'twins', accent: '#9fd4d4',
    hours: 9, key: 'enchantPower', per: 0.60,
    blurb: 'enchants +30% stronger',
  },
  {
    id: 'crownstars', name: 'The Crown', icon: 'crownstars', accent: '#ebb85b',
    hours: 12, key: 'setPower', per: 0.60,
    blurb: 'the set bonus +30% stronger',
  },
];

export const CONSTELLATION_BY_ID = Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, c]));

/** Every body the telescope can point at, planets and stars alike. */
export const BODY_BY_ID = { ...PLANET_BY_ID, ...CONSTELLATION_BY_ID };

export const COSMOS = {
  // Seconds of game time between automation ticks. Gathering planets grant
  // one full node's yield per tick; a hand on the tool works a node every
  // ~5s of walk, so a planet is roughly a third of doing it yourself.
  every: 10,
  // Share of the node's skill XP the background harvest pays.
  xpShare: 0.5,
  // A bench planet re-runs a brew/dish when its timer dips below this.
  topUpBelow: 60,
};

/** Seconds of observation a planet needs. */
export function observeTime(planet) {
  return planet.hours * 3600;
}

/** The one-line "what it does" for a row. */
export function describePlanet(planet) {
  return t(planet.blurb);
}
