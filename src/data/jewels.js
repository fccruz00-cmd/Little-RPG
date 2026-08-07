// Jewels: singularity-cut stones, bought with souls, and STRONG on
// purpose: this is the layer past prestige, and the owner priced the
// tier himself: "tem que ser buffs fortes porque é reset depois de
// prestígio". Ten stones, three facets each, every facet reaching the
// whole economy at once.
//
// The one law they still keep: gathering never pays damage. A jewel may
// double the gold, the dust, the meals or the piles, but the fight is
// bought elsewhere. `lens` says where a stone shines: 'gather' folds
// into gatherBonus (all four lines at once), 'fold' into the main bonus.
// `mode` reuses the talent grammar: mul is 1+f, less is 1-f, add is +f.

import { t } from '../i18n.js';
import { pct } from '../format.js';

export const JEWELS = [
  // --- the first four: the line itself ---
  {
    id: 'haste', name: 'Jewel of Haste', icon: 'bolt',
    lens: 'gather', key: 'gatherSpeed', mode: 'less',
    blurb: 'the swing shortens, then all but vanishes',
    facets: [0.35, 0.70, 1], costs: [4, 12, 36],
    describe: (rank, value) => (rank >= 3
      ? t('a swing costs only its minimum')
      : t('works {0} faster', pct(value))),
  },
  {
    id: 'plenty', name: 'Jewel of Plenty', icon: 'gold',
    lens: 'gather', key: 'yieldMul', mode: 'mul',
    blurb: 'every node weighs more than it looks',
    facets: [0.30, 0.60, 1.00], costs: [4, 12, 36],
    describe: (rank, value) => t('+{0} yield per node', pct(value)),
  },
  {
    id: 'springs', name: 'Jewel of Springs', icon: 'stride',
    lens: 'gather', key: 'nodeMul', mode: 'mul',
    blurb: 'the world sets its nodes closer together',
    facets: [0.20, 0.40, 0.60], costs: [4, 12, 36],
    describe: (rank, value) => t('nodes spawn {0} closer', pct(value)),
  },
  {
    id: 'study', name: 'Jewel of Study', icon: 'book',
    lens: 'gather', key: 'gatherXpMul', mode: 'mul',
    blurb: 'every swing teaches a little more',
    facets: [0.40, 0.80, 1.20], costs: [4, 12, 36],
    describe: (rank, value) => t('+{0} skill XP', pct(value)),
  },
  // --- the second six: the whole economy, priced like it ---
  {
    id: 'midas', name: 'Jewel of Midas', icon: 'gold',
    lens: 'fold', key: 'goldMul', mode: 'mul',
    blurb: 'everything the road pays, it pays again',
    facets: [0.25, 0.50, 1.00], costs: [8, 24, 72],
    describe: (rank, value) => t('+{0} gold, everywhere', pct(value)),
  },
  {
    id: 'cinders', name: 'Jewel of Cinders', icon: 'dust',
    lens: 'fold', key: 'dustMul', mode: 'mul',
    blurb: 'soul dust falls heavier around you',
    facets: [0.25, 0.50, 1.00], costs: [8, 24, 72],
    describe: (rank, value) => t('+{0} dust', pct(value)),
  },
  {
    id: 'tithes', name: 'Jewel of Tithes', icon: 'gem',
    lens: 'fold', key: 'treasure', mode: 'add',
    blurb: 'the fallen owe you a little more',
    facets: [0.04, 0.08, 0.15], costs: [8, 24, 72],
    describe: (rank, value) => t('+{0} treasure chance', pct(value)),
  },
  {
    id: 'echoes', name: 'Jewel of Echoes', icon: 'book',
    lens: 'fold', key: 'xpMul', mode: 'mul',
    blurb: 'every lesson repeats itself on the way down',
    facets: [0.30, 0.60, 1.00], costs: [8, 24, 72],
    describe: (rank, value) => t('+{0} XP', pct(value)),
  },
  {
    id: 'crucible', name: 'Jewel of the Crucible', icon: 'bar',
    lens: 'gather', key: 'refineLess', mode: 'less',
    blurb: 'the refinery asks for less and less raw',
    facets: [0.20, 0.35, 0.50], costs: [8, 24, 72],
    describe: (rank, value) => t('refining costs {0} less raw', pct(value)),
  },
  {
    id: 'feast', name: 'Jewel of the Feast', icon: 'regen',
    lens: 'gather', key: 'mealTime', mode: 'mul',
    blurb: 'a meal eaten under it refuses to end',
    facets: [0.50, 1.00, 2.00], costs: [8, 24, 72],
    describe: (rank, value) => t('meals last {0} longer', pct(value)),
  },
];

export const JEWEL_BY_ID = Object.fromEntries(JEWELS.map((j) => [j.id, j]));

export const JEWEL_MAX = 3;
