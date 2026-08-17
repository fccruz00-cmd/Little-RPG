import { pct } from '../format.js';
import { t } from '../i18n.js';

/**
 * Paths: what an awakening lets you BE, not just how much it pays.
 *
 * Before paths, the second ascension was the first one again, faster. A
 * path bends the run's shape instead of its length: each one trades a
 * little of something for a lot of something else, so Berserker's second
 * run and Sentinel's second run are different games played with the same
 * buttons. The numbers are deliberately within a talent respec of each
 * other -- a path is a flavour you commit to, not a trap you can pick.
 *
 * THE COMMITMENT RULE. Each awakening grants ONE free choice (`pathFree`),
 * spent when you pick and returned by the next awakening. Without it the
 * picker is a free stat toggle you flip before every fight, which is a
 * chore pretending to be a choice.
 *
 * `grants` speaks the bonus fold's own vocabulary: multiplier keys fold as
 * `1 + v` (so a negative is a real cost), additive keys just add.
 */
export const PATHS = [
  {
    id: 'berserker', name: 'Berserker', icon: 'damage', accent: '#e67146',
    grants: { dmgMul: 0.25, atkSpeedMul: 0.15, hpMul: -0.20 },
  },
  {
    id: 'sentinel', name: 'Sentinel', icon: 'shield', accent: '#6dba79',
    grants: { hpMul: 0.30, regenMul: 0.30, thorns: 0.10, dmgMul: -0.10 },
  },
  {
    id: 'plunderer', name: 'Plunderer', icon: 'bag', accent: '#ebb85b',
    grants: { goldMul: 0.30, xpMul: 0.15, dustChance: 0.10, dmgMul: -0.10 },
  },
];

export const PATH_BY_ID = Object.fromEntries(PATHS.map((p) => [p.id, p]));

const LABEL = {
  dmgMul: 'damage', atkSpeedMul: 'attack speed', hpMul: 'health',
  regenMul: 'regen', goldMul: 'gold', xpMul: 'XP',
  thorns: 'thorns', dustChance: 'dust chance',
};

/** "+25% damage · +15% attack speed · −20% health", costs included. */
export function describePath(path) {
  return Object.entries(path.grants)
    .map(([key, v]) => `${v > 0 ? '+' : '−'}${pct(Math.abs(v))} ${t(LABEL[key])}`)
    .join(' · ');
}
