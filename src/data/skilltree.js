/**
 * The talent web.
 *
 * Three columns of nodes was a shopping list: every branch independent, every
 * point obvious, nothing to decide. This is the small version of the thing
 * Path of Exile does -- a graph you TRAVEL, where a node opens because
 * something touching it is already yours.
 *
 * The shape is three lanes with four crossings between them:
 *
 *      FURY     ●──●──●──●──●──●──◆
 *                  │        │
 *                  ○        ○            ← crossings cost a point
 *                  │        │
 *      GUARD    ●──●──●──●──●──●──◆
 *                  │        │
 *                  ○        ○
 *                  │        │
 *      FORTUNE  ●──●──●──●──●──●──◆
 *
 * Three things follow from that shape, and they are the whole design:
 *
 * 1. YOU PICK A DOOR. All three lane heads are open from the first point, so
 *    the first thing the game asks is what kind of hero this run is.
 * 2. CROSSING COSTS. The link between lanes is a NODE, not a free edge, so
 *    splitting your points is a real price rather than a shrug. The crossings
 *    also carry hybrid stats, so the price buys something.
 * 3. THE END OF A LANE IS EARNED. A keystone (◆) still wants the node before
 *    it FULL, so the far end of a lane is a commitment, not a stroll.
 *
 * COORDINATES are a grid, not pixels: `x` 0..7, `y` 0..4, and the UI stretches
 * that to whatever box it has. Keeping the data in grid units is what lets the
 * same web fit a 490px phone panel and a 1180px tablet without two layouts.
 * Column 0 holds no node -- it is where the UI writes the lane names.
 *
 * NODE IDS ARE SAVE KEYS. Every id here that existed in the old three-column
 * tree is the same id, so a save from before the web keeps every point it
 * bought.
 */

export const LANES = [
  { id: 'fury',    name: 'Fury',    accent: '#e67146', y: 0 },
  { id: 'guard',   name: 'Guard',   accent: '#5aa9c9', y: 2 },
  { id: 'fortune', name: 'Fortune', accent: '#ebb85b', y: 4 },
];

/**
 * `kind` is what the node looks like and how hard it is to reach:
 *   'small'    a rung; opens when anything touching it has a point
 *   'cross'    a lane change; same rule, but it is the only way sideways
 *   'keystone' opens only when the node before it is FULL
 */
export const WEB = [
  // --- Fury: hit harder, hit oftener -----------------------------------
  { id: 'edge',      name: 'Keen Edge', icon: 'damage',       x: 1, y: 0, lane: 'fury', start: true,
    max: 15, key: 'dmgMul',       mode: 'mul', per: 0.06 },
  { id: 'haste',     name: 'Haste',     icon: 'attack_speed', x: 2, y: 0, lane: 'fury',
    max: 10, key: 'atkSpeedMul',  mode: 'mul', per: 0.04 },
  { id: 'precision', name: 'Precision', icon: 'crit',         x: 3, y: 0, lane: 'fury',
    max: 8,  key: 'critAdd',      mode: 'add', per: 0.02 },
  { id: 'carnage',   name: 'Carnage',   icon: 'crit_power',   x: 4, y: 0, lane: 'fury',
    max: 8,  key: 'critPowerAdd', mode: 'add', per: 0.25 },
  { id: 'rupture',   name: 'Rupture',   icon: 'dagger',       x: 5, y: 0, lane: 'fury',
    max: 6,  key: 'executeMul',   mode: 'add', per: 0.10 },
  { id: 'onslaught', name: 'Onslaught', icon: 'bolt',         x: 6, y: 0, lane: 'fury',
    max: 6,  key: 'doubleHit',    mode: 'add', per: 0.02 },
  { id: 'frenzy',    name: 'Frenzy',    icon: 'torch',        x: 7, y: 0, lane: 'fury',
    kind: 'keystone', max: 10, key: 'frenzy', mode: 'add', per: 0.003 },

  // --- Guard: still standing -------------------------------------------
  { id: 'leather',  name: 'Tough Hide', icon: 'health', x: 1, y: 2, lane: 'guard', start: true,
    max: 15, key: 'hpMul',       mode: 'mul',  per: 0.08 },
  { id: 'stamina',  name: 'Stamina',    icon: 'regen',  x: 2, y: 2, lane: 'guard',
    max: 12, key: 'regenMul',    mode: 'mul',  per: 0.12 },
  { id: 'carapace', name: 'Carapace',   icon: 'shield', x: 3, y: 2, lane: 'guard',
    max: 8,  key: 'damageTaken', mode: 'less', per: 0.03 },
  { id: 'rally',    name: 'Rally',      icon: 'orb',    x: 4, y: 2, lane: 'guard',
    max: 5,  key: 'respawnMul',  mode: 'less', per: 0.12 },
  { id: 'mending',  name: 'Mending',    icon: 'regen',  x: 5, y: 2, lane: 'guard',
    max: 6,  key: 'lifesteal',   mode: 'add',  per: 0.005 },
  { id: 'bulwark',  name: 'Bulwark',    icon: 'boss',   x: 6, y: 2, lane: 'guard',
    max: 5,  key: 'bossTime',    mode: 'add',  per: 2 },
  { id: 'thorns',   name: 'Thorns',     icon: 'shield', x: 7, y: 2, lane: 'guard',
    kind: 'keystone', max: 6, key: 'thorns', mode: 'add', per: 0.05 },

  // --- Fortune: everything the fight leaves behind ----------------------
  { id: 'pockets',    name: 'Deep Pockets', icon: 'gold',   x: 1, y: 4, lane: 'fortune', start: true,
    max: 15, key: 'goldMul',    mode: 'mul', per: 0.08 },
  { id: 'lore',       name: 'Lore',         icon: 'book',   x: 2, y: 4, lane: 'fortune',
    max: 12, key: 'xpMul',      mode: 'mul', per: 0.08 },
  { id: 'stride',     name: 'Stride',       icon: 'stride', x: 3, y: 4, lane: 'fortune',
    max: 8,  key: 'moveMul',    mode: 'mul', per: 0.06 },
  { id: 'scout',      name: 'Scout',        icon: 'scout',  x: 4, y: 4, lane: 'fortune',
    max: 3,  key: 'killsLess',  mode: 'add', per: 1 },
  { id: 'prospector', name: 'Prospector',   icon: 'dust',   x: 5, y: 4, lane: 'fortune',
    max: 6,  key: 'dustChance', mode: 'add', per: 0.02 },
  { id: 'vigil',      name: 'Vigil',        icon: 'crit',   x: 6, y: 4, lane: 'fortune',
    max: 6,  key: 'ambush',     mode: 'add', per: 0.08 },
  { id: 'treasure',   name: 'Treasure',     icon: 'bag',    x: 7, y: 4, lane: 'fortune',
    kind: 'keystone', max: 6, key: 'treasure', mode: 'add', per: 0.03 },

  // --- the crossings ----------------------------------------------------
  // Sitting BETWEEN two lanes, and carrying something both of them want, so
  // the point a lane change costs is not a toll for nothing.
  { id: 'tempered', name: 'Tempered', icon: 'gear',  x: 2, y: 1, kind: 'cross',
    max: 6, key: 'damageTaken', mode: 'less', per: 0.02 },
  { id: 'scavenger', name: 'Scavenger', icon: 'bag', x: 2, y: 3, kind: 'cross',
    max: 8, key: 'goldMul', mode: 'mul', per: 0.05 },
  { id: 'bloodlust', name: 'Bloodlust', icon: 'dagger', x: 5, y: 1, kind: 'cross',
    max: 6, key: 'lifesteal', mode: 'add', per: 0.004 },
  { id: 'plunder',  name: 'Plunder',  icon: 'dust',  x: 5, y: 3, kind: 'cross',
    max: 8, key: 'dustMul', mode: 'mul', per: 0.10 },
];

/**
 * Edges, written once and read both ways. A node opens when ANY neighbour has
 * a point in it -- which is what makes the web a web rather than three lists
 * with decoration.
 */
const EDGES = [
  ['edge', 'haste'], ['haste', 'precision'], ['precision', 'carnage'],
  ['carnage', 'rupture'], ['rupture', 'onslaught'], ['onslaught', 'frenzy'],

  ['leather', 'stamina'], ['stamina', 'carapace'], ['carapace', 'rally'],
  ['rally', 'mending'], ['mending', 'bulwark'], ['bulwark', 'thorns'],

  ['pockets', 'lore'], ['lore', 'stride'], ['stride', 'scout'],
  ['scout', 'prospector'], ['prospector', 'vigil'], ['vigil', 'treasure'],

  // the four ways across
  ['haste', 'tempered'], ['tempered', 'stamina'],
  ['stamina', 'scavenger'], ['scavenger', 'lore'],
  ['rupture', 'bloodlust'], ['bloodlust', 'mending'],
  ['mending', 'plunder'], ['plunder', 'prospector'],
];

export const NODE_BY_ID = Object.fromEntries(WEB.map((n) => [n.id, n]));

/** id -> neighbour ids, both directions. */
export const NEIGHBOURS = (() => {
  const map = Object.fromEntries(WEB.map((n) => [n.id, []]));
  for (const [a, b] of EDGES) {
    map[a].push(b);
    map[b].push(a);
  }
  return map;
})();

/** Edges as node pairs, for drawing. */
export const WEB_EDGES = EDGES.map(([a, b]) => [NODE_BY_ID[a], NODE_BY_ID[b]]);

export const WEB_COLS = 8;
export const WEB_ROWS = 5;

/**
 * Relative track sizes. The lane-name column and the two crossing rows do not
 * need a whole node's worth of space, and giving it to them was costing the
 * third lane its place on a 390px-tall phone.
 *
 * The wires are computed from these SAME numbers, so the SVG keeps landing
 * exactly on node centres no matter how the box is stretched. Change a weight
 * here and both halves move together; hard-code one in CSS and they drift.
 */
export const COL_W = [0.8, 1, 1, 1, 1, 1, 1, 1];
export const ROW_H = [1, 0.72, 1, 0.72, 1];

/** Where each track starts, in the same units. */
const starts = (sizes) => sizes.reduce((acc, w) => [...acc, acc.at(-1) + w], [0]);
const COL_X = starts(COL_W);
const ROW_Y = starts(ROW_H);

export const WEB_W = COL_X.at(-1);
export const WEB_H = ROW_Y.at(-1);

/** A node's centre, in viewBox units. */
export function webCenter(node) {
  return {
    cx: COL_X[node.x] + COL_W[node.x] / 2,
    cy: ROW_Y[node.y] + ROW_H[node.y] / 2,
  };
}

/**
 * The two `grid-template-*` values, so CSS never repeats these numbers.
 *
 * `minmax(0, Nfr)` and not `Nfr`: a bare fr track refuses to shrink below its
 * content's min-content width, so the lane-name column quietly stole nine
 * pixels from the grid and slid every wire off its node.
 */
export const COL_TRACKS = COL_W.map((w) => `minmax(0, ${w}fr)`).join(' ');
export const ROW_TRACKS = ROW_H.map((h) => `minmax(0, ${h}fr)`).join(' ');

/**
 * A keystone still wants its ONE approach node full -- the node before it in
 * its lane. Everything else opens on a single point in any neighbour.
 */
export function webUnlocked(node, ranksOf) {
  if (node.start) return true;
  const neighbours = NEIGHBOURS[node.id] ?? [];
  if (node.kind === 'keystone') {
    return neighbours.some((id) => (ranksOf[id] ?? 0) >= NODE_BY_ID[id].max);
  }
  return neighbours.some((id) => (ranksOf[id] ?? 0) > 0);
}

/** What a keystone is waiting for, for the explanation line. */
export function keystoneGate(node) {
  const id = (NEIGHBOURS[node.id] ?? [])[0];
  return id ? NODE_BY_ID[id] : null;
}
