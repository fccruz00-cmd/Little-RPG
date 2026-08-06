// Feats: lifetime marks that pay a small permanent bonus each.
//
// Every feat reads one counter from `state.stats`, and the counters only
// ever go up, so completion is monotone: the fold can derive it instead of
// storing it, and nothing an awakening wipes can take a feat back.
//
// The bonuses are deliberately small. A feat is a pat on the back with a
// number attached, not a progression pillar; the pillars stay where they
// are. `key/mode/per` reuse the talent-node shape so the fold applies a
// completed feat with `apply(feat, 1)`.

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
];

/** Fresh lifetime counters, one per stat a feat can read. `rebirths` counts
 *  every reset ever taken -- prestige and awakening both -- and is what
 *  wakes the Hall of Ancestors' spirits. */
export function emptyStats() {
  return {
    kills: 0, bossKills: 0, deaths: 0, forges: 0, legendaries: 0,
    refines: 0, feeds: 0, brews: 0, cooks: 0, dungeonWins: 0, bloodWins: 0,
    rebirths: 0, contracts: 0,
  };
}

export function featDone(feat, stats) {
  return (stats[feat.stat] ?? 0) >= feat.need;
}
