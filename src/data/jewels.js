// Jewels: singularity-cut stones, bought with souls, that better the LINE.
//
// Four stones, three facets each, and every facet reaches all four
// gathering skills at once, the way the charted sky does. They are the
// souls' second sink (the soul web being the first), and they are pure
// quality of life by design: gathering never pays damage, so the jewels
// pay speed, weight, closeness and schooling, never the fight.
//
// Facet values fold into `gatherBonus`, so every consumer (work time,
// node yield, node spacing, skill XP) reads them through the same lens
// as the trees and the constellations.

import { t } from '../i18n.js';
import { pct } from '../format.js';

export const JEWELS = [
  {
    id: 'haste', name: 'Jewel of Haste', icon: 'bolt',
    blurb: 'the swing shortens, then all but vanishes',
    facets: [0.35, 0.70, 1], costs: [4, 12, 36],
    describe: (rank, value) => (rank >= 3
      ? t('a swing costs only its minimum')
      : t('works {0} faster', pct(value))),
  },
  {
    id: 'plenty', name: 'Jewel of Plenty', icon: 'gold',
    blurb: 'every node weighs more than it looks',
    facets: [0.20, 0.40, 0.60], costs: [4, 12, 36],
    describe: (rank, value) => t('+{0} yield per node', pct(value)),
  },
  {
    id: 'springs', name: 'Jewel of Springs', icon: 'stride',
    blurb: 'the world sets its nodes closer together',
    facets: [0.15, 0.30, 0.45], costs: [4, 12, 36],
    describe: (rank, value) => t('nodes spawn {0} closer', pct(value)),
  },
  {
    id: 'study', name: 'Jewel of Study', icon: 'book',
    blurb: 'every swing teaches a little more',
    facets: [0.30, 0.60, 0.90], costs: [4, 12, 36],
    describe: (rank, value) => t('+{0} skill XP', pct(value)),
  },
];

export const JEWEL_BY_ID = Object.fromEntries(JEWELS.map((j) => [j.id, j]));

export const JEWEL_MAX = 3;
