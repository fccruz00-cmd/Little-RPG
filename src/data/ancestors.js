// The Hall of Ancestors, opened by the first rebirth.
//
// Every reset leaves behind the hero you were, and this is where they wait.
// An ancestor is assigned ONE shop upgrade and buys it on its own, forever:
// through the rest of this run, through the next rebirth, through an
// awakening. The fantasy is precise -- your past lives remember what you
// used to buy -- and so is the rule: a spirit only does what a finger could,
// one shelf row at a time, out of the same purse.
//
// Spirits wake on LIFETIME rebirths (`stats.rebirths`, which counts
// awakenings too and never resets), so the deeper the save's history, the
// fuller the hall. That gives the fifth and twelfth rebirth something to
// hand you besides relics.

export const ANCESTORS = [
  { id: 'founder', name: 'The Founder', at: 1,  accent: '#8fb8e8' },
  { id: 'keeper',  name: 'The Keeper',  at: 2,  accent: '#7fd0a8' },
  { id: 'blade',   name: 'The Blade',   at: 3,  accent: '#e8a48f' },
  { id: 'miser',   name: 'The Miser',   at: 5,  accent: '#e8d48f' },
  { id: 'sage',    name: 'The Sage',    at: 8,  accent: '#b8a0e8' },
  { id: 'warden',  name: 'The Warden',  at: 12, accent: '#8fdce8' },
  { id: 'reaper',  name: 'The Reaper',  at: 17, accent: '#d88fe8' },
  { id: 'eternal', name: 'The Eternal', at: 23, accent: '#f0f0da' },
];

export const HALL = {
  // Seconds between one spirit's visits to the shop. Herald (the relic
  // talent) buys roughly this often too; they compose rather than compete,
  // because Herald picks the BEST row and a spirit keeps its ONE row topped.
  period: 8,
  // A level-L spirit buys up to L levels per visit. Five is the ceiling:
  // past that the hall would out-shop the player watching it.
  maxLevel: 5,
  // Dust to raise a spirit, tripling per level: 40, 120, 360, 1080.
  // Sized against the forge (a roll costs 10-250) so maxing one spirit is
  // a real chase and maxing eight is an endgame, not an afternoon.
  upgradeBase: 40,
  upgradeGrowth: 3,
};

/** What the spirits must leave untouched, as a fraction of the purse. */
export const RESERVES = [0, 0.25, 0.5, 0.75];

// The Ancestral Bounty: a hall-wide blessing, not a spirit. Each level
// makes every gather pay one MORE type of its line -- work an oak and the
// pine comes along, then the birch -- bounded by what the tool can reach,
// because the dead widen your hands but cannot sharpen your axe. Four
// levels, so the last one pays the WHOLE line in one swing; each rise
// costs four times the one before, priced past the last spirit rise:
// this is what dust is for once the whole parade stands at five.
export const BOUNTY = {
  max: 4,
  costs: [750, 3000, 12000, 48000],
};

/** Dust cost to take a spirit from `level` to `level + 1`. */
export function spiritUpCost(level) {
  return HALL.upgradeBase * Math.pow(HALL.upgradeGrowth, level - 1);
}

/** How many spirits `rebirths` lifetime resets have woken. */
export function spiritsAwake(rebirths) {
  let n = 0;
  for (const a of ANCESTORS) if (rebirths >= a.at) n += 1;
  return n;
}
