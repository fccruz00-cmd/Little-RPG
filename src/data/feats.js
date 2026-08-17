// Feats: lifetime marks that pay a small permanent bonus PER RUNG.
//
// Every feat reads one counter from `state.stats`, and the counters only
// ever go up, so the ladder is monotone: the fold derives the rungs
// instead of storing them, and nothing an awakening wipes climbs back
// down. There is no top: each goal reached DOUBLES into the next one,
// and every rung pays the feat's bonus again. The owner's words, on the
// old one-and-done list: "remove o teto, sempre que alcançar a meta
// dobra".
//
// The bonuses are deliberately small per rung. A feat is a pat on the
// back with a number attached, not a progression pillar; doubling goals
// keep the ladder honest, because each rung costs twice the play the
// last one did. `key/mode/per` reuse the talent-node shape so the fold
// applies a feat with `apply(feat, rungs)`.

export const FEATS = [
  { id: 'hundred',   name: 'First Hundred',  stat: 'kills',       need: 100,
    key: 'dmgMul', mode: 'mul', per: 0.02, desc: 'kill 100 enemies' },
  { id: 'slayer',    name: 'Slayer',         stat: 'kills',       need: 5000,
    key: 'dmgMul', mode: 'mul', per: 0.04, desc: 'kill 5,000 enemies' },
  { id: 'legion',    name: "Legion's End",   stat: 'kills',       need: 50000,
    key: 'dmgMul', mode: 'mul', per: 0.06, desc: 'kill 50,000 enemies' },
  { id: 'regicide',  name: 'Regicide',       stat: 'bossKills',   need: 25,
    key: 'bossTime', mode: 'add', per: 3, desc: 'bring down 25 bosses' },
  { id: 'kingsbane', name: 'Kingsbane',      stat: 'bossKills',   need: 200,
    key: 'bossTime', mode: 'add', per: 5, desc: 'bring down 200 bosses' },
  { id: 'lessons',   name: 'Hard Lessons',   stat: 'deaths',      need: 25,
    key: 'hpMul', mode: 'mul', per: 0.05, desc: 'go down 25 times' },
  { id: 'stubborn',  name: 'Stubborn',       stat: 'deaths',      need: 250,
    key: 'respawnMul', mode: 'less', per: 0.15, desc: 'go down 250 times' },
  { id: 'forgehand', name: 'Forgehand',      stat: 'forges',      need: 50,
    key: 'dustMul', mode: 'mul', per: 0.10, desc: 'forge 50 times' },
  { id: 'goldtouch', name: 'Golden Touch',   stat: 'legendaries', need: 3,
    key: 'dustChance', mode: 'add', per: 0.04, desc: 'roll 3 Legendaries' },
  { id: 'industry',  name: 'Industrialist',  stat: 'refines',     need: 1000,
    key: 'goldMul', mode: 'mul', per: 0.05, desc: 'refine 1,000 units' },
  { id: 'bestfriend',name: 'Best Friend',    stat: 'feeds',       need: 50,
    key: 'hpMul', mode: 'mul', per: 0.04, desc: 'feed your pets 50 times' },
  { id: 'alchemist', name: 'Alchemist',      stat: 'brews',       need: 20,
    key: 'xpMul', mode: 'mul', per: 0.05, desc: 'brew 20 potions' },
  { id: 'delver',    name: 'Delver',         stat: 'dungeonWins', need: 10,
    key: 'goldMul', mode: 'mul', per: 0.06, desc: 'clear 10 dungeons' },
  { id: 'bloodproof',name: 'Bloodproof',     stat: 'bloodWins',   need: 5,
    key: 'dmgMul', mode: 'mul', per: 0.05, desc: 'clear 5 Bloodmoons' },
  // --- the second shelf: the counters that had no medal yet, and higher
  // rungs on the busiest ones, each with a bonus its neighbours lack ---
  { id: 'linecook',  name: 'Line Cook',      stat: 'cooks',       need: 25,
    key: 'moveMul', mode: 'mul', per: 0.04, desc: 'plate 25 dishes' },
  { id: 'signature', name: 'Signature Dish', stat: 'cooks',       need: 200,
    key: 'yieldAll', mode: 'add', per: 0.02, desc: 'plate 200 dishes' },
  { id: 'contractor',name: 'Contractor',     stat: 'contracts',   need: 15,
    key: 'treasure', mode: 'add', per: 0.01, desc: 'claim 15 contracts' },
  { id: 'headhunter',name: 'Headhunter',     stat: 'contracts',   need: 100,
    key: 'goldMul', mode: 'mul', per: 0.05, desc: 'claim 100 contracts' },
  { id: 'returned',  name: 'Ever Returning', stat: 'rebirths',    need: 5,
    key: 'xpMul', mode: 'mul', per: 0.06, desc: 'take 5 resets' },
  { id: 'ouroboros', name: 'Ouroboros',      stat: 'rebirths',    need: 25,
    key: 'dmgMul', mode: 'mul', per: 0.05, desc: 'take 25 resets' },
  { id: 'denmother', name: 'Den Mother',     stat: 'feeds',       need: 500,
    key: 'feedLess', mode: 'less', per: 0.05, desc: 'feed your pets 500 times' },
  { id: 'brewmaster',name: 'Brewmaster',     stat: 'brews',       need: 200,
    key: 'regenMul', mode: 'mul', per: 0.06, desc: 'brew 200 potions' },
  { id: 'keymaster', name: 'Keymaster',      stat: 'dungeonWins', need: 50,
    key: 'treasure', mode: 'add', per: 0.01, desc: 'clear 50 dungeons' },
  { id: 'mythwright',name: 'Mythwright',     stat: 'legendaries', need: 15,
    key: 'critPowerAdd', mode: 'add', per: 0.05, desc: 'roll 15 Legendaries' },
  { id: 'anvilborn', name: 'Anvilborn',      stat: 'forges',      need: 500,
    key: 'damageTaken', mode: 'less', per: 0.03, desc: 'forge 500 times' },
  { id: 'moonchild', name: 'Moonchild',      stat: 'bloodWins',   need: 25,
    key: 'lifesteal', mode: 'add', per: 0.004, desc: 'clear 25 Bloodmoons' },
  { id: 'magnate',   name: 'Magnate',        stat: 'refines',     need: 20000,
    key: 'goldMul', mode: 'mul', per: 0.05, desc: 'refine 20,000 units' },
];

/** Fresh lifetime counters, one per stat a feat can read. `rebirths` counts
 *  every reset ever taken -- prestige and awakening both -- and is what
 *  wakes the Hall of Ancestors' spirits. */
export function emptyStats() {
  return {
    kills: 0, bossKills: 0, deaths: 0, forges: 0, legendaries: 0,
    refines: 0, feeds: 0, brews: 0, cooks: 0, dungeonWins: 0, bloodWins: 0,
    rebirths: 0, contracts: 0,
    // The leaderboard-league ledger. `paidPacks` counts real-money packs,
    // `gemPower` counts gem buys that hand over POWER (chest, idol) and
    // `gemQoL` the ones that only buy pace (coin, hourglass). Lifetime and
    // one-way, because a league you can wash out of is not a league.
    paidPacks: 0, gemPower: 0, gemQoL: 0,
  };
}

/** Rungs a counter has climbed: 0 below the base goal, then one per
 *  doubling. No ceiling, by owner's decree. */
export function featRanks(feat, stats) {
  const count = stats[feat.stat] ?? 0;
  if (count < feat.need) return 0;
  return Math.floor(Math.log2(count / feat.need)) + 1;
}

/** The count the NEXT rung asks for. Never null: the ladder has no top. */
export function featNext(feat, stats) {
  return feat.need * Math.pow(2, featRanks(feat, stats));
}
