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
    ['dmgMul', 'mul', 0.024], ['critAdd', 'add', 0.004], ['bossTime', 'add', 0.5],
    ['dmgMul', 'mul', 0.03], ['critPowerAdd', 'add', 0.04],
  ],
  chopping: [
    ['moveMul', 'mul', 0.016], ['atkSpeedMul', 'mul', 0.01], ['doubleHit', 'add', 0.004],
    ['moveMul', 'mul', 0.02], ['atkSpeedMul', 'mul', 0.012],
  ],
  fishing: [
    ['regenMul', 'mul', 0.03], ['lifesteal', 'add', 0.002], ['feedLess', 'less', 0.008],
    ['regenMul', 'mul', 0.036], ['lifesteal', 'add', 0.0024],
  ],
  farming: [
    ['xpMul', 'mul', 0.024], ['goldMul', 'mul', 0.02], ['yieldAll', 'add', 0.008],
    ['xpMul', 'mul', 0.03], ['goldMul', 'mul', 0.024],
  ],
};
const REFINED_POOLS = {
  mining: [
    ['hpMul', 'mul', 0.024], ['damageTaken', 'less', 0.004], ['thorns', 'add', 0.004],
    ['hpMul', 'mul', 0.03], ['damageTaken', 'less', 0.005],
  ],
  chopping: [
    ['dustChance', 'add', 0.0024], ['dustMul', 'mul', 0.024], ['ambush', 'add', 0.006],
    ['dustChance', 'add', 0.003], ['dustMul', 'mul', 0.03],
  ],
  fishing: [
    ['hpMul', 'mul', 0.02], ['regenMul', 'mul', 0.024], ['respawnMul', 'less', 0.006],
    ['hpMul', 'mul', 0.024], ['regenMul', 'mul', 0.03],
  ],
  farming: [
    ['workAll', 'mul', 0.008], ['yieldAll', 'add', 0.006], ['treasure', 'add', 0.004],
    ['workAll', 'mul', 0.01], ['yieldAll', 'add', 0.008],
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
