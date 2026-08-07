/**
 * Dungeons: what the bars and planks were piling up for.
 *
 * A key is forged from refined material, and it opens a fixed run of rooms
 * at a fixed difficulty. That difficulty comes from the KEY, not from your
 * stage, so a key is a challenge you choose to take rather than one the line
 * hands you, and a key you cannot clear yet stays a target.
 *
 * THIS IS THE ONE PLACE REWARDS MAY TOUCH DAMAGE. Everywhere else, gathering
 * pays only in access and conversion, because kills produce nodes and nodes
 * producing damage rebuilds the compounding loop the stat caps prevent. Here
 * the loop is broken by the key cost: killing faster fills a key faster, but
 * a key pays a FIXED amount once, and the next tier costs far more than the
 * last. The cost curve is the governor of the whole system.
 */

import { GEM_DROP, GEM_FIRST } from './gems.js';

export const DUNGEON = {
  rooms: 8,        // seven fights and then the boss
  bossTime: 40,    // a little more room than the line's boss
  // Rooms hit harder than the same level on the line. Without this an eight
  // room run was over in fifteen seconds, which is not what a thing you
  // spend a key on should feel like. Health carries most of it; damage rises
  // enough that the run can still kill you, which is the actual stake.
  roomHp: 1.8,
  roomDmg: 1.15,
};

/**
 * One key per resource tier. `level` is the stage the rooms are scaled to,
 * set well past where that tier's material becomes available, so a key is
 * always a stretch when you first can afford it.
 *
 * Cost grows about 2.4x a tier while gathering income grows far slower, which
 * is what stops a cleared dungeon from paying for the next one outright.
 */
// Every room is a mini boss and the last is the boss, so `level` bites much
// harder than the same number on the line. Measured from stage 25 against
// the Copper Key: damage level 30 and 45 die, 60 and up clear, in fifteen to
// twenty seconds. Short, but the run is a pass or fail rather than a grind,
// and failing costs the key.
//
// Gold is deliberately the small part of the payout, and priced off YOUR
// stage rather than the key's: gold is the one thing here you can already
// farm, so the reason to run a deeper key is relics and dust. The relic
// payouts sit HIGH on purpose, five-ish times their first sizing: a run
// costs minutes that combat would otherwise spend pushing stages, and the
// bot audit proved the old numbers never paid that time back.
// `gems` and `firstGems` come from data/gems.js, which owns the whole gem
// economy; they are folded in below so a key stays one readable row.
export const KEYS = [
  { tier: 0, name: 'Copper Key',  level: 26, cost: { bars: 40,  planks: 30 },
    relics: 5,  dust: 120,  goldMul: 30 },
  { tier: 1, name: 'Iron Key',    level: 44, cost: { bars: 95,  planks: 70 },
    relics: 10, dust: 320,  goldMul: 40 },
  { tier: 2, name: 'Silver Key',  level: 64, cost: { bars: 230, planks: 170 },
    relics: 20, dust: 850,  goldMul: 50 },
  { tier: 3, name: 'Gold Key',    level: 86, cost: { bars: 550, planks: 410 },
    relics: 36, dust: 2200, goldMul: 65 },
  { tier: 4, name: 'Mithril Key', level: 112, cost: { bars: 1300, planks: 980 },
    relics: 60, dust: 5600, goldMul: 85 },
].map((key) => ({ ...key, gems: GEM_DROP[key.tier], firstGems: GEM_FIRST[key.tier] }));

export const KEY_BY_TIER = Object.fromEntries(KEYS.map((k) => [k.tier, k]));

/**
 * What a run is worth. Payout is proportional to the rooms cleared, so a run
 * that dies in room six is most of a win rather than nothing: the key is
 * spent either way, and a total loss on an idle game you were not watching
 * is a bad trade for the player.
 *
 * Relics and gems are the exception and only pay on a full clear. They are the
 * currencies that outlive the run, and rounding a partial into them would let
 * a key farm them off rooms the build cannot actually finish.
 *
 * `first` is the one-off bounty for going deeper than the save ever has. The
 * caller decides whether it applies, because only it knows what `deepestKey`
 * said before this run touched it.
 */
export function dungeonReward(key, cleared, won, first = false) {
  const share = Math.min(1, cleared / DUNGEON.rooms);
  return {
    relics: won ? key.relics : 0,
    gems: won ? key.gems + (first ? key.firstGems : 0) : 0,
    dust: Math.round(key.dust * share),
    goldMul: key.goldMul * share,
  };
}
