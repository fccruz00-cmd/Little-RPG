# Shipping Little RPG on Google Play, with gem packs

The game is a static page. Play Billing is native. This document is the
bridge between those two facts: what to build, in what order, and the three
things that will cost you real money if you get them wrong.

Everything below assumes the game code as it stands. `src/store/billing.js`
already speaks both of the protocols described here; nothing in the game
needs to change to add a store.

---

## 1. Pick a wrapper

| | **Capacitor** (recommended) | **TWA** (Bubblewrap) |
|---|---|---|
| where the game lives | inside the APK | on a web server you host |
| works with no network | **yes** | only via a service worker cache |
| billing | a plugin you bridge to `window.LittleRPGBilling` | Digital Goods API, no bridge to write |
| Play Console | ordinary app | app + Digital Asset Links on your domain |

**Take Capacitor.** The offline promise is the game's, not an accident, and
a TWA that fails to load on a bad connection is a one-star review about a
game that does not need the network at all. The cost is writing a ~40 line
bridge, which is section 3.

```
npm install @capacitor/core @capacitor/cli
npx cap init "Little RPG" com.yourname.littlerpg --web-dir=.
npx cap add android
```

`--web-dir=.` ships the repo as-is: `index.html`, `styles.css`, `src/`,
`assets/`. Do not ship `little-rpg.html` as well — it is the same game a
second time, and it would double the APK.

---

## 2. Create the products

Play Console → your app → **Monetise → In-app products**. Four **managed
products**, all **consumable**, with these exact IDs — they are the SKUs
`src/store/billing.js` asks for:

| product ID | gems | suggested |
|---|---:|---|
| `gems_pouch` | 60 | the small honest one |
| `gems_sack` | 190 | ~2.5x the price of the pouch |
| `gems_chest` | 520 | ~6x |
| `gems_hoard` | 1400 | ~14x |

The gem counts are in `PACKS` in `src/store/billing.js`; change them there
if you reprice, and keep the IDs in sync.

For scale: a full Mythic board is seven Mythic Chests, 420 gems. So the chest
pack covers it and the hoard covers it with room to spare — and a player who
never pays gets there on dungeon clears instead. That is the ratio the whole
thing turns on.

**Never put a price in the code.** The store owns prices: it knows the
country, the currency, the tax and any sale you are running. `billing.js`
asks the store for a formatted price string and shows exactly that. A number
typed into the repo would be wrong for most of the planet on day one.

To sanity-check the ladder against the game: a Mithril Bloodmoon clear pays
24 gems, and the three wares cost 20 / 30 / 45. So a pouch is about two and
a half deep clears. That ratio is the whole negotiation — set it where a
player who never pays still gets somewhere, because that is the promise
`data/gems.js` is written to keep.

---

## 3. The bridge

Capacitor needs one object on `window`. `billing.js` looks for exactly this
shape and nothing else:

```js
globalThis.LittleRPGBilling = {
  // -> [{ sku, price }]   price is the store's own FORMATTED string
  async getProducts(skus) { ... },
  // -> { token, state }   state: 'purchased' | 'pending'   (null if cancelled)
  async purchase(sku) { ... },
  // makes a consumable buyable again
  async consume(token) { ... },
  // -> [{ sku, token, state }]  anything bought and not yet consumed
  async getPurchases() { ... },
};
```

Back it with any Play Billing plugin — `@capacitor-community/in-app-purchases`
or RevenueCat both work. Register it **before** the game's `main.js` runs;
`billing.connect()` is called once while the UI is built, and a bridge that
appears later is not seen until the next launch.

If you go the TWA route instead, write nothing: Chrome exposes
`getDigitalGoodsService('https://play.google.com/billing')` inside a TWA and
`billing.js` uses it automatically. You still need
`<uses-permission android:name="com.android.vending.BILLING" />` in the
manifest Bubblewrap generates.

---

## 4. The three things that cost real money

### Order of operations

**Pay → credit → save → consume.** Never any other order.

Consuming is what makes a consumable buyable again, and it can fail: the
network drops, the process is killed, the user force-quits. If you consume
first and then crash, the gems are gone and the money was taken. If you
credit first and then fail to consume, the purchase stays owned and Play
re-delivers it on the next launch — which is free, because
`GameState.redeemPurchase()` keys on the purchase token and pays each one
exactly once.

That ledger is the load-bearing part. Without it, re-delivery pays twice and
a player who learns to kill the app at the right moment mints gems.
`billing.js` and the test suite both exist mostly to hold this shape.

### Acknowledge within three days

Play auto-refunds any purchase not acknowledged within 72 hours. Consuming
implies acknowledging, so the flow above covers it — but only if
`consume()` actually reaches Play. `redeemOwed()` runs on every `connect()`
and retries anything still owed, which is what turns a dropped connection
into a delay instead of a refund.

### Pending purchases

Cash and bank-transfer payments come back `pending`. They are not paid yet.
`billing.js` credits nothing and returns `{ok: false, reason: 'pending'}`;
the gems arrive on a later launch once Play flips it to purchased. Crediting
a pending purchase is giving the goods away.

---

## 5. The problem this repo cannot solve for you

**The save lives in WebView `localStorage`, and money now depends on it.**

Android can clear WebView storage under pressure, "Clear data" wipes it, and
a reinstall does not restore it. Today that costs a player their progress,
which is bad. With gem packs on sale it costs them something they paid for,
which is refunds, support mail and reviews.

Consumables cannot be restored from Play — once consumed, Play considers the
transaction finished and will not re-deliver it. So the save *is* the
receipt, and it needs to be more durable than a browser origin.

Fix it before you sell anything. In rough order of effort:

1. **Mirror the save to the filesystem** via `@capacitor/preferences`, and
   enable Android Auto Backup so a reinstall restores it. Cheapest real fix;
   covers reinstall and most storage clearing.
2. **Prompt an export.** The game already has Export save in Options. A
   one-time nudge after a purchase is nearly free to build.
3. **Cloud save** (Play Games Services, or your own). Solves it properly,
   and is the only option that survives a lost phone — but it puts the game
   on the network for the first time, and the privacy policy would need
   rewriting well beyond the paragraph section 6 adds.

---

## 6. Before you publish

- **Fill in `PRIVACY.md`.** `<name or company>` and `<contact email>` are
  still placeholders, and Play requires a working privacy policy URL for any
  app with in-app purchases. The policy already describes gem purchases; it
  cannot be published with the contact blank.
- **Data safety form.** Declare purchase history. Nothing else changes: the
  game still collects no personal data and makes no requests of its own.
- **Asset licences.** Four third-party art packs are in this repo with no
  licence file, one of them a paid product. This is the blocking item for a
  commercial release, and it is not a code problem.
- **Test with licence testers**, not the `android.test.*` SKUs — those never
  exercise consumption or re-delivery, which are the parts that break.
- **The fee.** Google takes 15% of the first $1M per year, 30% above it.

## 7. Free, with gem packs

That is the plan, and it is the one everything in `data/gems.js` was written
for. The store listing should say so plainly: **free, with optional gem
purchases, and every gem earnable by playing.** That last clause is true, it
is unusual enough to be worth saying, and it is the thing a review will check.

The faucet is what makes the shop optional, so the faucet is the part to
protect. If a change ever makes gems harder to earn, it has made the shop
less optional, whatever it did to revenue that week.

Two lines to hold in the listing and in any update:

- Nothing in the shop is exclusive. The Mythic Chest sells the best item in
  the game, and the forge rolls Mythic too — rarely, and more often the
  deeper Smithing goes. Gems buy the shortcut, never the destination.
- Nothing is a gamble. Every ware states exactly what it hands over before
  the money moves. No loot boxes, so no odds disclosure, no gambling-adjacent
  policy surface, and nothing to explain to a reviewer.

Google's own **Data safety** and **Ads** declarations stay simple as a
result: purchases yes, ads no, analytics no, data collection none.
