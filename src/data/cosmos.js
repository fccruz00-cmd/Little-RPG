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
    hours: 13, auto: 'refine',
    blurb: 'the deep refines every pile on its own',
  },
];

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

export const COSMOS = {
  // Seconds of game time between automation ticks. Gathering planets grant
  // one full node's yield per tick; a hand on the tool works a node every
  // ~5s of walk, so a planet is roughly a third of doing it yourself.
  every: 15,
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
