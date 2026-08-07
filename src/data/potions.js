// The cauldron: Smithing's second bench, unlocked with nothing.
//
// Each potion drinks one line's surplus. Planks buy time on the boss clock,
// bars buy fury, dust buys luck, so every pile that was quietly outgrowing
// its use gets a live lever to become. Effects are temporary on purpose:
// a potion is a decision about the next ten minutes, not a stat.
//
// The Time Draught is the one that matters most. The practical end of a run
// is the boss timer, measured at stage 235 with everything else maxed, and
// this is the first tool the player can point straight at it.

export const POTIONS = [
  {
    id: 'time', name: 'Time Draught', icon: 'boss', accent: '#5aa9c9',
    resource: 'refined', line: 'chopping',
    effect: 'bossTime', amount: 20,
    duration: 600,
    blurb: '+20s on every boss timer while it lasts',
  },
  {
    id: 'fury', name: 'Fury Tonic', icon: 'damage', accent: '#e67146',
    resource: 'refined', line: 'mining',
    effect: 'dmgMul', amount: 0.25,
    duration: 600,
    blurb: '+25% damage while it lasts',
  },
  {
    id: 'lucky', name: 'Lucky Brew', icon: 'gold', accent: '#ebb85b',
    resource: 'dust', line: null,
    effect: 'goldMul', amount: 0.5,
    duration: 600,
    blurb: '+50% gold while it lasts',
  },
];

export const POTION_BY_ID = Object.fromEntries(POTIONS.map((p) => [p.id, p]));

// Costs scale with bestStage so the brew keeps pace with the economy: the
// same tier logic the rest of gathering uses, one price per material band.
// Index by the deepest resource tier the save has seen (0..4).
export const POTION_COSTS = {
  time:  [12, 30, 70, 160, 380],    // planks of the deepest tier seen
  fury:  [16, 40, 95, 220, 520],    // bars of the deepest tier seen
  lucky: [60, 120, 260, 600, 1400], // dust, flat by band
};
