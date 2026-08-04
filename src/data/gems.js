/**
 * Gems: the one currency the dungeon pays and the shop spends.
 *
 * Everything else in the game is earned in one place and spent in the same
 * place. Gems cross the whole board instead: they come out of dungeons and
 * go back in as gold, as time, or as gear. That is deliberate, because a
 * currency you can also be sold has to be worth something everywhere, or
 * buying it is a trap.
 *
 * THE RULES THIS FILE EXISTS TO KEEP
 *
 * 1. Every gem is earnable. The faucet below is the whole faucet; a purchase
 *    tops the same purse up and unlocks nothing a clear cannot.
 * 2. Nothing here is permanent. Every ware is a consumable that saves time,
 *    so a wallet buys pace and never a ceiling. The permanent tracks (relics,
 *    souls, feats, pets) do not accept gems and are not meant to.
 * 3. Prices are fixed. A price that climbs with what you have already bought
 *    is how a shop starts hunting the people worst at leaving it alone.
 */

/**
 * Gems a FULL clear pays, by key tier. Partial runs pay none: gems follow
 * relics here rather than dust, because a currency that also costs money must
 * never be farmable by dying in room two on a loop.
 */
export const GEM_DROP = [2, 3, 5, 8, 12];

/**
 * A one-off bounty the first time a clear takes you deeper than you have ever
 * been. It is measured against `deepestKey`, which nothing resets, so this is
 * paid once per tier for the life of the save. Five tiers, 150 gems: enough
 * to meet the shop properly without ever having to open a wallet.
 */
export const GEM_FIRST = [10, 15, 25, 40, 60];

/** The Bloodmoon doubles gems the same way it doubles everything else. */

// --- the shop -------------------------------------------------------
// Three wares, one per thing a stuck player actually lacks: money, time, or
// a slot that will not roll. Costs are in the same neighbourhood as a few
// clears, so the shop is a place you visit between runs rather than a tab.

export const CACHE_SECONDS = 3600;  // Coin Cache: an hour of your best rate
export const SKIP_SECONDS = 7200;   // Hourglass: two hours of real fighting
export const CHEST_FLOOR = 3;       // Gilded Chest: Epic, index into RARITIES

export const GEM_WARES = [
  {
    id: 'coin', name: 'Coin Cache', icon: 'gold', cost: 20,
    blurb: 'an hour of your best gold rate, paid now',
    // Priced off the best rate the save has ever held, not the live one.
    // The moment this ware is worth anything is the hour after a rebirth,
    // when the live rate is zero and the shop is exactly what you want.
  },
  {
    id: 'skip', name: 'Hourglass', icon: 'boss', cost: 30,
    blurb: 'the fight really runs two hours, in a few seconds',
    // Not a payout: the simulation runs. Kills, experience, dust, stages,
    // gathering and every drop along the way, at full rate rather than the
    // offline half.
  },
  {
    id: 'chest', name: 'Gilded Chest', icon: 'it_chest', cost: 45,
    blurb: 'your weakest slot, reforged at Epic or better',
    // Aimed at the weakest slot on purpose. The set bonus keys off the
    // LOWEST rarity worn, so this is the one purchase that can move a whole
    // board up a tier, and it is useless to anyone already wearing Epic.
  },
];

export const WARE_BY_ID = Object.fromEntries(GEM_WARES.map((w) => [w.id, w]));
