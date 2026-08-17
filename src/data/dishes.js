// The kitchen: Cooking's bench, fed by Farming's crates.
//
// A dish is a potion that grew in the ground: a timed buff with its own
// slot, stacking with brews and with Well Fed. Every effect here obeys the
// gathering balance rule -- dishes pay in economy and pace (yield, gold,
// XP, stride), never in damage, so the fourth line cannot feed the
// compounding loop the stat caps exist to prevent.
//
// Costs are CRATES of the deepest band seen, the same tier logic the
// cauldron uses, which keeps the kitchen priced against the field that
// supplies it at every depth.

export const DISHES = [
  {
    id: 'stew', name: 'Harvest Stew', icon: 'stew', accent: '#c9803c',
    effect: 'yieldMul', amount: 0.25,
    duration: 600,
    blurb: '+25% yield from every node while it lasts',
  },
  {
    id: 'pie', name: 'Golden Pie', icon: 'pie', accent: '#ebb85b',
    effect: 'goldMul', amount: 0.25,
    duration: 600,
    blurb: '+25% gold while it lasts',
  },
  {
    id: 'rations', name: 'Trail Rations', icon: 'rations', accent: '#a3763f',
    effect: 'moveMul', amount: 0.20,
    duration: 600,
    blurb: '+20% stride while it lasts',
  },
  {
    id: 'jam', name: "Scholar's Jam", icon: 'jam', accent: '#b74132',
    effect: 'xpMul', amount: 0.25,
    duration: 600,
    blurb: '+25% XP while it lasts',
  },
];

export const DISH_BY_ID = Object.fromEntries(DISHES.map((d) => [d.id, d]));

// Crates of the deepest band seen, one price per band like POTION_COSTS.
export const DISH_COSTS = {
  stew:    [10, 25, 60, 140, 330],
  pie:     [14, 34, 80, 190, 440],
  rations: [8,  20, 48, 110, 260],
  jam:     [12, 30, 70, 160, 380],
};
