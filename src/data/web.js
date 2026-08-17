/**
 * Webs: the shape every tree in the game is drawn on.
 *
 * A column of nodes is a shopping list -- every branch independent, every
 * point obvious, nothing to decide. A WEB is the small version of what Path
 * of Exile does: a graph you TRAVEL, where a node opens because something
 * touching it is already yours.
 *
 * Every web in Little RPG is the same silhouette -- three lanes side by side,
 * with the space between them used for links:
 *
 *      LANE A   ●──●──●──●──●──●──◆     ● node   ○ crossing   ◆ keystone
 *                  │        │
 *                  ○        ○
 *                  │        │
 *      LANE B   ●──●──●──●──●──●──◆
 *                  │        │
 *                  ○        ○
 *                  │        │
 *      LANE C   ●──●──●──●──●──●──◆
 *
 * Three lanes and not four is a layout fact, not a taste: the panel gives a
 * tree roughly 200px of height on the phone this game is built for, and five
 * rows of node is exactly what fits. A fourth lane would scroll.
 *
 * COORDINATES ARE GRID CELLS, not pixels: `x` and `y` index the tracks in
 * `colW` / `rowH`, and the UI stretches those tracks to whatever box it has.
 * Column 0 is always empty -- it is where the lane names are written.
 *
 * NODE IDS ARE SAVE KEYS. Laying a tree out as a web must never rename one.
 */

/** Column tracks: a narrow gutter for the lane names, then one per node. */
export const cols = (n) => [0.8, ...Array(n).fill(1)];

/**
 * Row tracks. The crossing rows carry a smaller node and do not need a whole
 * one's worth of height; taking it back is what buys the third lane its place
 * on a 390px-tall phone.
 */
export const ROW_H = [1, 0.72, 1, 0.72, 1];

/** The y of each lane, in row units. Crossings live on the odd rows between. */
export const LANE_Y = [0, 2, 4];

/**
 * One lane: existing node objects, laid left to right from x = 1.
 *
 * `from` is the tree's own node data -- `max`, `cost`, `key`, `mode`, `per`
 * and the rest all stay where they were defined. A web adds nothing but
 * position, so there is one place to change what a node DOES.
 */
export function lane(laneId, y, ids, from) {
  return ids.map((id, i) => {
    const node = from[id];
    if (!node) throw new Error(`web: no node "${id}"`);
    return { ...node, lane: laneId, x: i + 1, y, start: i === 0 };
  });
}

/** A node that sits between two lanes, and is the only way across. */
export function cross(id, x, y, from) {
  const node = from[id];
  if (!node) throw new Error(`web: no node "${id}"`);
  return { ...node, x, y, kind: 'cross' };
}

/** Every node of a column tree, by id, so a web can place them by name. */
export function byId(tree) {
  return Object.fromEntries(tree.flatMap((b) => b.nodes).map((n) => [n.id, n]));
}

/**
 * Wires along a lane, plus the vertical links between lanes.
 *
 * `links` is a list of [x, throughId] -- the column the link runs down, and
 * the crossing node it passes through, or null for a direct link. Small trees
 * link directly because there is nothing worth spending a crossing on; the
 * big ones charge a point for it, which is what makes splitting them a real
 * decision instead of a shrug.
 */
export function wires(lanes, links) {
  const edges = [];
  for (const ids of lanes) {
    for (let i = 1; i < ids.length; i += 1) edges.push([ids[i - 1], ids[i]]);
  }
  for (const [above, below, through] of links) {
    if (through) edges.push([above, through], [through, below]);
    else edges.push([above, below]);
  }
  return edges;
}

/**
 * Folds a layout into everything the game and the UI need to read it.
 *
 * `colW` and `rowH` drive BOTH the CSS grid and the SVG wire endpoints, which
 * is the only reason a wire lands on a node centre from a 300px panel to a
 * 620px one. Put a track size in the stylesheet instead and the two halves
 * drift apart.
 */
export function makeWeb({ id, lanes, nodes, edges, colW, rowH = ROW_H }) {
  const byNodeId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const neighbours = Object.fromEntries(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    if (!byNodeId[a] || !byNodeId[b]) throw new Error(`web ${id}: bad edge ${a}-${b}`);
    neighbours[a].push(b);
    neighbours[b].push(a);
  }

  const starts = (sizes) => sizes.reduce((acc, w) => [...acc, acc.at(-1) + w], [0]);
  const colX = starts(colW);
  const rowY = starts(rowH);

  return {
    id,
    lanes,
    nodes,
    byId: byNodeId,
    neighbours,
    wires: edges.map(([a, b]) => [byNodeId[a], byNodeId[b]]),
    width: colX.at(-1),
    height: rowY.at(-1),
    // `minmax(0, Nfr)` and not `Nfr`: a bare fr track refuses to shrink below
    // its content, and the lane-name column quietly stole nine pixels and slid
    // every wire off its node.
    colTracks: colW.map((w) => `minmax(0, ${w}fr)`).join(' '),
    rowTracks: rowH.map((h) => `minmax(0, ${h}fr)`).join(' '),
    /** A node's centre, in viewBox units. */
    center: (node) => ({
      cx: colX[node.x] + colW[node.x] / 2,
      cy: rowY[node.y] + rowH[node.y] / 2,
    }),
  };
}

/**
 * Is this node reachable yet?
 *
 * A lane head is always open, so the first point is a choice of lane rather
 * than a queue. Everything else opens on a single point in ANY neighbour --
 * except a keystone, which wants its approach FULL. That is the whole reason
 * a keystone feels earned: it costs a committed lane, not a spare point.
 *
 * A node you have ALREADY BOUGHT is always open, and that clause is not
 * decoration. Six relic branches became three lanes, so nodes that used to be
 * branch heads -- Herald, Respite, Pack Leader, Green Thumb -- are now in the
 * middle of somebody else's lane. Without this, a save from before the
 * relayout would keep its points and its bonus but be unable to add to them,
 * which reads as the game eating a purchase. It cannot be exploited either:
 * the FIRST point in a node still needs a path to it.
 */
export function webUnlocked(web, node, ranksOf) {
  if (node.start || (ranksOf[node.id] ?? 0) > 0) return true;
  const near = web.neighbours[node.id] ?? [];
  if (node.kind === 'keystone') {
    return near.some((id) => (ranksOf[id] ?? 0) >= web.byId[id].max);
  }
  return near.some((id) => (ranksOf[id] ?? 0) > 0);
}

/** What a keystone is waiting for, for the explanation line. */
export function webGate(web, node) {
  const id = (web.neighbours[node.id] ?? [])[0];
  return id ? web.byId[id] : null;
}
