// Omniscience: the ledger of everything you have ever held.
//
// One row per countable pile in the game: the five currencies, every raw
// resource and every refined one. Each row remembers its RECORD, the most
// of that thing ever held at once, and the record only climbs: spending,
// rebirth and awakening take nothing back. Records pay in MARKS, one per
// power of ten past the row's base, and every mark is a small permanent
// buff of that row's own flavour.
//
// The design debt this pays: the game teaches you to spend every pile the
// moment it exists (refine it, forge it, brew it), so a full warehouse
// never felt like anything. Now the biggest pile you ever sat on is a
// score, in the greenstack spirit: hoarding is a play, not a mistake --
// but only the PEAK matters, so the game never punishes spending either.
//
// Values are deliberately small. Forty-five rows times up to twelve marks
// is a wide blanket; each thread has to be thin or the blanket carries
// the game.

import { SKILLS, GATHER_IDS } from './gathering.js';

export const OMNI = {
  cap: 12,   // marks one record can climb; gold WILL find this ceiling
};

/** Marks a record has earned: 0 below base, +1 per power of ten past it. */
export function omniTier(record, base) {
  if (!record || record < base) return 0;
  return Math.min(OMNI.cap, Math.floor(Math.log10(record / base)) + 1);
}

/** The pile the NEXT mark asks for, or null at the ceiling. */
export function omniNext(record, base) {
  const tier = omniTier(record, base);
  if (tier >= OMNI.cap) return null;
  return base * Math.pow(10, tier);
}

const row = (id, name, icon, base, [key, mode, per], read) =>
  ({ id, name, icon, base, key, mode, per, read });

// The currencies, each with the buff it obviously owes.
const CURRENCY_ROWS = [
  row('gold',   'Gold',      'gold',  10000, ['goldMul',  'mul', 0.02],  (s) => s.gold),
  row('dust',   'Soul dust', 'dust',  50,    ['dustMul',  'mul', 0.02],  (s) => s.dust),
  row('gems',   'Gems',      'gem',   15,    ['treasure', 'add', 0.004], (s) => s.gems),
  row('relics', 'Relics',    'relic', 15,    ['dmgMul',   'mul', 0.02],  (s) => s.relics),
  row('souls',  'Souls',     'orb',   8,     ['hpMul',    'mul', 0.02],  (s) => s.souls),
];

// One buff recipe per resource slot, raw and refined, by line. Hand-picked
// so neighbours differ and the flavour tracks the line: ore hits harder,
// wood moves faster, fish keeps you standing, crops pay the mind.
const RAW_POOLS = {
  mining: [
    ['dmgMul', 'mul', 0.012], ['critAdd', 'add', 0.002], ['bossTime', 'add', 0.25],
    ['dmgMul', 'mul', 0.015], ['critPowerAdd', 'add', 0.02],
  ],
  chopping: [
    ['moveMul', 'mul', 0.008], ['atkSpeedMul', 'mul', 0.005], ['doubleHit', 'add', 0.002],
    ['moveMul', 'mul', 0.010], ['atkSpeedMul', 'mul', 0.006],
  ],
  fishing: [
    ['regenMul', 'mul', 0.015], ['lifesteal', 'add', 0.001], ['feedLess', 'less', 0.004],
    ['regenMul', 'mul', 0.018], ['lifesteal', 'add', 0.0012],
  ],
  farming: [
    ['xpMul', 'mul', 0.012], ['goldMul', 'mul', 0.010], ['yieldAll', 'add', 0.004],
    ['xpMul', 'mul', 0.015], ['goldMul', 'mul', 0.012],
  ],
};
const REFINED_POOLS = {
  mining: [
    ['hpMul', 'mul', 0.012], ['damageTaken', 'less', 0.002], ['thorns', 'add', 0.002],
    ['hpMul', 'mul', 0.015], ['damageTaken', 'less', 0.0025],
  ],
  chopping: [
    ['dustChance', 'add', 0.0012], ['dustMul', 'mul', 0.012], ['ambush', 'add', 0.003],
    ['dustChance', 'add', 0.0015], ['dustMul', 'mul', 0.015],
  ],
  fishing: [
    ['hpMul', 'mul', 0.010], ['regenMul', 'mul', 0.012], ['respawnMul', 'less', 0.003],
    ['hpMul', 'mul', 0.012], ['regenMul', 'mul', 0.015],
  ],
  farming: [
    ['workAll', 'mul', 0.004], ['yieldAll', 'add', 0.003], ['treasure', 'add', 0.002],
    ['workAll', 'mul', 0.005], ['yieldAll', 'add', 0.004],
  ],
};

const RESOURCE_ROWS = GATHER_IDS.flatMap((skillId) => {
  const skill = SKILLS[skillId];
  return skill.resources.flatMap((res, i) => [
    row(`raw:${res.id}`, res.name, skill.rawIcon, 50,
      RAW_POOLS[skillId][i], (s) => s.raw[res.id] ?? 0),
    row(`ref:${res.id}`, res.name, skill.refinedIcon, 20,
      REFINED_POOLS[skillId][i], (s) => s.refined[res.id] ?? 0),
  ]);
});

export const OMNI_ROWS = [...CURRENCY_ROWS, ...RESOURCE_ROWS];
