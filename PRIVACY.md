# Privacy Policy

**Last updated:** 3 August 2026

## The short version

Little RPG runs entirely on your device. It has no servers, makes no network
requests, and collects nothing about you. Your save lives in your own
browser's storage and never leaves it.

The one place personal data does change hands is **buying the game**, and
that happens on the store, not in the game. See *Purchases* below.

You do not have to take this on faith. The whole game is one readable HTML
file with no minification and no bundled tracker, and the source is public.
Search it for `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` and you
will find nothing.

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

There is no name, no email, no account, no device identifier and no location
in that record. It is written by your browser, read by your browser, and is
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
- No network requests of any kind, to us or to anyone else
- No selling or sharing of personal information, because none is collected

## Purchases

Little RPG is a paid game. Payment is handled entirely by the store you buy
it from. **We never see or receive your card number, billing address or
payment credentials.**

The gems the game uses are earned by clearing dungeons and are spent in the
game's own shop. The version you have makes no purchases of any kind: there
is no store inside the game, no gem pack to buy and no request to any payment
provider. If that ever changes, the section below on *Changes to this policy*
applies, and this page will say so before that version ships.

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

Once the game is downloaded and running, it does not talk to any of them
again. It works with the network switched off.

## Your data, your control

Because the save never leaves your device, you control it completely.

- **Delete everything from inside the game:** *Ascend* tab, *Awaken*, then
  *Erase everything and start over*. This removes the save entry outright.
- **Delete it from the browser:** clear site data or local storage for
  wherever the game is running.
- **Back it up or move it:** *Ascend* tab, *Export save* copies your whole
  save as one line of text; *Import save* pastes it back in anywhere. The
  same value is also visible as `little-rpg.save.v1` in your browser's
  developer tools.

Note that saves are per-browser and per-origin. The downloaded single file
opened from your disk and a hosted copy on the web keep separate saves, and
clearing your browser data removes the save with it. We cannot recover a lost
save, because we never had a copy.

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
