# Privacy Policy

**Last updated:** 4 August 2026

## The short version

Little RPG runs entirely on your device. We have no servers, the game sends
us nothing, and it collects nothing about you. Your save lives in your own
device's storage and never leaves it.

The game is free. Personal data changes hands in exactly one place: **buying
gems**, which is optional, and which happens on the app store rather than in
the game. See *Purchases* below.

You do not have to take this on faith. The game is readable source with no
minification and no bundled tracker, and it is public. Search it for `fetch`,
`XMLHttpRequest`, `WebSocket` or `sendBeacon` and you will find nothing: the
only code that talks to anything is `src/store/billing.js`, it speaks solely
to the app store's billing service, and it does so only when you tap a pack.

## What the game stores on your device

One entry in your browser's `localStorage`, under the key
`little-rpg.save.v1`. It holds your progress and nothing else:

- Stage, deepest stage, gold, kills
- Upgrade levels, character level and experience
- Talent, relic and soul trees, relics, souls, rebirths and awakenings
- Soul dust, forged gear, dungeon keys, gems and your best gold rate
- Gathering skills: levels, trees, tools, raw and refined resources
- Pets: which are tamed and their levels
- Potion timers: seconds remaining on active brews
- Lifetime counters used by feats: kills, bosses, deaths, forges, refines,
  feeds, brews, dungeon clears
- Settings: buy-max, auto-forge, sound, music, damage numbers and language
- A timestamp of when you last had the game open, used only to work out
  offline earnings the next time you open it
- If your copy sells gems: the store's receipt id for each gem pack already
  delivered, so an interrupted purchase is not paid out twice. The last fifty
  are kept. See *Buying gems inside the game* below

There is no name, no email, no account, no device identifier and no location
in that record. It is written by your device, read by your device, and is
never transmitted anywhere.

The game reads exactly two things from your browser beyond that save:
`window.devicePixelRatio`, so the pixel art renders sharply on your screen,
and `document.hidden`, so the fight keeps running while the tab is in the
background. Neither is stored and neither is sent anywhere. Sound is
synthesized on your device as it plays; there are no audio files and
nothing is recorded.

Export save shows you the exact data leaving with you: it is the same
record described above, encoded as one line of text, and it only goes
where you paste it.

## What the game does not do

- No accounts, logins or profiles
- No analytics, telemetry, crash reporting or usage statistics
- No advertising, ad networks or advertising identifiers
- No cookies
- No third-party scripts, fonts, or content delivery networks. The game uses
  the monospace font already installed on your system
- No network requests of its own, to us or to anyone else. The one exception
  is a gem purchase, which is handed to the app store's billing service and
  goes nowhere near a server of ours. With no purchase in flight, the game
  works with the network switched off
- No selling or sharing of personal information, because none is collected

## Purchases

Little RPG is free to download and free to play. The only thing it ever sells
is gems, and gems can also be earned by playing. Payment is handled entirely
by the app store. **We never see or receive your card number, billing address
or payment credentials.**

### Buying gems inside the game

Gems are earned by clearing dungeons. Some versions of the game also sell
them. The **pouch button** at the top right opens the store: if your copy has
one attached, it lists gem packs with prices in your own currency, and if it
does not, it says so — that copy sells nothing and makes no purchases of any
kind.

Where it does appear, the purchase is carried out **by the app store's own
billing service**, not by the game. The game asks the store what the packs
cost and tells it which one you chose; the store handles everything else.
**Your card number, billing address and payment credentials never pass
through the game**, and there is no server of ours involved at any point.

What the game keeps afterwards is one thing: a **purchase token** for each
pack it has already credited, stored in your save alongside everything else.
It is a pseudonymous receipt id issued by the store, and it exists so that a
purchase which was interrupted can be re-delivered without paying you twice.
It contains no name, no email and no payment details, and the last fifty are
kept. It is never transmitted anywhere; the game only ever hands it back to
the same store that issued it, to mark the purchase as delivered.

The store is the party that collects and controls your purchase data. What it
collects, how long it keeps it, and what rights you have over it are governed
by **that store's privacy policy**, not this one. Please read it.

What we receive from the store is limited to what it chooses to show a
developer: typically aggregate sales figures and payout records, and in some
cases a pseudonymous purchase or refund identifier for support. We do not use
any of it to build a profile, and we do not combine it with anything from
inside the game, because the game sends us nothing to combine it with.

If you contact us for support and include your email or an order number, we
will hold that message for as long as it takes to help you and no longer.

## Where you got the game

This policy covers the game itself. It does not cover the platform you
obtained it from or the connection you used to download it.

Any store or web host will see your IP address and request details simply
because that is how the internet delivers a file, and stores additionally
hold your account and purchase history. Those parties are independent
controllers of that data under their own policies.

Once the game is downloaded and running, the only thing that ever reaches
the store again is a gem purchase you started, and only for as long as it
takes to complete. Nothing else does, and with no purchase in flight the
game works with the network switched off.

## Your data, your control

Because the save never leaves your device, you control it completely.

- **Delete everything from inside the game:** *Ascend* tab, *Awaken*, then
  *Erase everything and start over*. This removes the save entry outright.
- **Delete it from the browser:** clear site data or local storage for
  wherever the game is running.
- **Back it up or move it:** the *gear* button at the top right, then
  *Export save*, copies your whole save as one line of text; *Import save*
  pastes it back in anywhere. The same value is also visible as
  `little-rpg.save.v1` in your browser's developer tools.

Note that saves are per-browser and per-origin. The downloaded single file
opened from your disk and a hosted copy on the web keep separate saves, and
clearing your browser data removes the save with it. **We cannot recover a
lost save, because we never had a copy** — that includes gems, whether they
were cleared for or bought. Export is the only backup there is, and it is
worth using before you clear browser data or move devices.

## Children

The game collects no personal information from anyone, children included. It
has no chat, no social features, no user-generated content and no advertising.
Purchases are made through the store, which applies its own age and parental
controls.

## Your rights

Privacy laws such as the GDPR (Europe), the LGPD (Brazil) and the CCPA
(California) give you rights to access, correct, delete and port your personal
data, and to object to its processing.

For the game, these rights have nothing to act on: we hold no personal data
about you, so there is nothing to hand over, correct or delete on our side,
and your save is already fully in your hands. For purchase data, the store is
the controller, and you exercise those rights with the store.

If you believe we hold data about you and want it addressed, write to us at
the address below.

## Changes to this policy

If the game ever starts collecting or transmitting anything, this policy will
be updated before that version ships, and the change will be noted in the
release notes. The date at the top always reflects the current version.

## Contact

<!--
  Fill these in before publishing. Both are required for the policy to be
  usable, and most stores will not accept a policy without a contact.
  Consider a dedicated address rather than a personal one: this document is
  public and gets scraped.
-->

- **Developer:** `<name or company>`
- **Email:** `<contact email>`
