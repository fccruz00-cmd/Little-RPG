/**
 * Buying gems, when there is a store to buy them from.
 *
 * The game itself is a static page with no network. This module is the only
 * part that talks to anything, and only when it is running inside a store
 * wrapper that answered. In a plain browser `connect()` finds nothing,
 * `available` stays false, and the shop never shows a price. That is the
 * normal case, including every build you can open from disk.
 *
 * TWO BACKENDS, ONE INTERFACE
 *
 * - Digital Goods API. What a Trusted Web Activity gets: `PaymentRequest`
 *   plus `getDigitalGoodsService('https://play.google.com/billing')`, both
 *   standard web APIs that Chrome wires to Play Billing inside a TWA.
 * - A native bridge. What a Capacitor or Cordova wrapper injects: an object
 *   at `window.LittleRPGBilling` with the four methods below. Use this one
 *   if the game ships its assets inside the APK, which is what keeps it
 *   working with the network off.
 *
 *   getProducts(skus)  -> [{ sku, price }]                price is FORMATTED
 *                                                         and localised by
 *                                                         the store
 *   purchase(sku)      -> { token, state }                state: 'purchased'
 *                                                         | 'pending'
 *   consume(token)     -> void                            makes it re-buyable
 *   getPurchases()     -> [{ sku, token, state }]         anything still owed
 *
 * PRICES ARE NEVER HARDCODED. The store owns them: it knows the country, the
 * currency, the tax and whatever sale is running. A number typed in here
 * would be wrong for most of the planet on day one.
 */

/**
 * What money buys. Only the SKU and the gem count live here; the price comes
 * back from the store at runtime and the SKUs must match the managed products
 * created in the Play Console exactly.
 *
 * The ladder gives more gems per unit as the pack grows, which is ordinary,
 * and stops there. No pack is time-limited, no pack is "best value" in
 * flashing letters, and the smallest one is a real purchase rather than bait
 * priced to be useless.
 */
export const PACKS = [
  { sku: 'gems_pouch', gems: 60,   name: 'Pouch of gems' },
  { sku: 'gems_sack',  gems: 190,  name: 'Sack of gems' },
  { sku: 'gems_chest', gems: 520,  name: 'Chest of gems' },
  { sku: 'gems_hoard', gems: 1400, name: 'Hoard of gems' },
];

export const PACK_BY_SKU = Object.fromEntries(PACKS.map((p) => [p.sku, p]));

const PLAY = 'https://play.google.com/billing';

export class Billing {
  /**
   * @param {import('../game/state.js').GameState} state
   * @param {(gems: number, pack: object) => void} [onCredit] told when gems land
   */
  constructor(state, onCredit = () => {}) {
    this.state = state;
    this.onCredit = onCredit;
    this.backend = null;   // 'native' | 'digital-goods'
    this.service = null;
    this.prices = new Map();  // sku -> formatted price string
    this.busy = false;
  }

  get available() {
    return this.backend != null && this.prices.size > 0;
  }

  /** Packs the store actually offered, with its own price strings. */
  catalogue() {
    return PACKS.filter((p) => this.prices.has(p.sku))
      .map((p) => ({ ...p, price: this.prices.get(p.sku) }));
  }

  /**
   * Looks for a store, loads prices, and settles anything owed. Safe to call
   * anywhere: it swallows its own failures, because a browser with no store
   * is the expected case and not an error.
   *
   * @returns {Promise<boolean>} whether a store answered.
   */
  async connect() {
    try {
      if (globalThis.LittleRPGBilling) {
        this.backend = 'native';
        this.service = globalThis.LittleRPGBilling;
      } else if (typeof globalThis.getDigitalGoodsService === 'function') {
        this.service = await globalThis.getDigitalGoodsService(PLAY);
        this.backend = 'digital-goods';
      } else {
        return false;
      }

      const skus = PACKS.map((p) => p.sku);
      const details = this.backend === 'native'
        ? await this.service.getProducts(skus)
        : await this.service.getDetails(skus);
      for (const item of details ?? []) {
        // The Digital Goods API returns a structured price; a native bridge
        // is asked for the formatted string the store already built.
        const price = item.price ?? formatPrice(item);
        if (item.itemId ?? item.sku) this.prices.set(item.itemId ?? item.sku, price);
      }

      // Anything bought but never consumed is owed. This is the path a
      // purchase takes when the app died between paying and crediting.
      await this.redeemOwed();
      return this.available;
    } catch {
      this.backend = null;
      return false;
    }
  }

  /**
   * Delivers every purchase the store still considers owned. Crediting is
   * idempotent by token, so a re-delivery of something already banked pays
   * nothing and simply gets consumed again.
   */
  async redeemOwed() {
    let owned = [];
    try {
      owned = this.backend === 'native'
        ? await this.service.getPurchases()
        : await this.service.listPurchases();
    } catch {
      return 0;
    }
    let total = 0;
    for (const item of owned ?? []) {
      const token = item.token ?? item.purchaseToken;
      const pack = PACK_BY_SKU[item.sku ?? item.itemId];
      if (!pack || !token) continue;
      if (item.state && item.state !== 'purchased') continue;   // still pending
      total += this.deliver(token, pack);
      await this.consume(token);
    }
    return total;
  }

  /**
   * Buys one pack.
   *
   * ORDER MATTERS AND IS NOT NEGOTIABLE: pay, credit, save, then consume.
   * Consuming first would lose the gems if anything went wrong before they
   * were banked, and that is somebody's money. Crediting first can only ever
   * cost a re-delivery, which the token ledger absorbs.
   *
   * @returns {Promise<{ok: boolean, gems?: number, reason?: string}>}
   */
  async buy(sku) {
    const pack = PACK_BY_SKU[sku];
    if (!pack || !this.available || this.busy) return { ok: false, reason: 'unavailable' };
    this.busy = true;
    try {
      const result = this.backend === 'native'
        ? await this.service.purchase(sku)
        : await this.buyViaPaymentRequest(sku);
      if (!result) return { ok: false, reason: 'cancelled' };

      // Slow payment methods (cash, bank transfer) land here. Nothing is
      // owed yet and nothing may be credited; redeemOwed picks it up on a
      // later launch, once the store says it went through.
      if (result.state === 'pending') return { ok: false, reason: 'pending' };

      const token = result.token ?? result.purchaseToken;
      const gems = this.deliver(token, pack);
      await this.consume(token);
      return { ok: true, gems };
    } catch {
      return { ok: false, reason: 'failed' };
    } finally {
      this.busy = false;
    }
  }

  /** Credits through the state's ledger, and tells the UI if anything landed. */
  deliver(token, pack) {
    const gems = this.state.redeemPurchase(token, pack.gems);
    if (gems > 0) this.onCredit(gems, pack);
    return gems;
  }

  async consume(token) {
    try {
      await this.service.consume(token);
    } catch {
      // Left owned on purpose. redeemOwed() will find it next launch and
      // try again; the ledger makes sure it is not paid for twice.
    }
  }

  /** The TWA path: PaymentRequest is how a Digital Goods purchase is made. */
  async buyViaPaymentRequest(sku) {
    const request = new PaymentRequest(
      [{ supportedMethods: PLAY, data: { sku } }],
      { total: { label: 'Total', amount: { currency: 'BRL', value: '0' } } },
    );
    const response = await request.show();
    await response.complete('success');
    return { token: response.details?.purchaseToken, state: 'purchased' };
  }
}

/** Digital Goods returns `{currency, value}`; make it something readable. */
function formatPrice(item) {
  const p = item.price;
  if (!p || typeof p === 'string') return p ?? '';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency })
      .format(Number(p.value));
  } catch {
    return `${p.currency} ${p.value}`;
  }
}
