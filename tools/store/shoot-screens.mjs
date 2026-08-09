// The eight phone screenshots a Play listing wants, at 1920x1080 (16:9,
// both sides inside Play's 320..3840). Real UI, nothing hidden, nothing
// mocked: one save deep enough that every tab has something in it, and
// then one shot per tab.
//
//   sh serve.sh
//   cp tools/store/shoot-screens.mjs <where playwright lives>/ && node shoot-screens.mjs
//
// Playwright is not a dependency of this repo (the game has none), so the
// script runs from wherever the test battery's node_modules is and writes
// back here via LRPG_ROOT.
//
// The listing's default language is pt-BR, so the game is shot in
// Portuguese: an English screenshot under a Portuguese listing is the
// first thing a reviewer notices and the first thing a player distrusts.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = process.env.LRPG_ROOT
  ?? dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = process.env.OUTDIR ?? join(ROOT, 'docs', 'store', 'screenshots');
mkdirSync(OUT, { recursive: true });

// Deep enough to open every door: three awakenings and a Singularity, so
// the Forge, the Hall, the Awaken tab and the sky are all unlocked, and
// the lifetime counters feats read from are past their first rungs.
const SAVE = {
  version: 15, gold: 4.2e9, stage: 128, maxStage: 143, bestStage: 143, kills: 41200,
  levels: {
    damage: 240, attackRate: 120, critChance: 60, critDamage: 90, maxHp: 180,
    regen: 70, moveSpeed: 40, goldGain: 130, armor: 60, lifesteal: 40,
  },
  level: 78, xp: 40,
  talents: { edge: 10, haste: 8, leather: 10, greed: 8, focus: 6 },
  relics: 340, relicsEarned: 2600, relicTalents: { legacy: 15, vault: 15, echo: 10 },
  prestiges: 5, souls: 62, awakens: 3, singularity: 1, extraRelics: 0,
  soulTalents: { forgemaster: 5, hoard: 4 }, path: 'none', pathFree: true,
  // Gear values are RARITY INDEXES into RARITIES, not levels: a board of
  // Legendary with a Mythic sword, which is what a third awakening wears.
  dust: 48000,
  gear: { sword: 5, helmet: 4, armor: 4, pants: 4, boots: 3, amulet: 4, ring: 3 },
  // Epic and better carry an affix, so a board this good has to show them:
  // an empty Encantos header over six enchanted slots is a lie the UI tells
  // when the save is hand-written.
  gearMods: {
    sword: { id: 'keen', tier: 3 }, helmet: { id: 'wise', tier: 2 },
    armor: { id: 'hungry', tier: 1 }, pants: { id: 'dusty', tier: 2 },
    boots: { id: 'swift', tier: 1 }, amulet: { id: 'gilded', tier: 3 },
    ring: { id: 'keen', tier: 1 },
  },
  autoCraftOn: true,
  skills: {
    mining: { level: 44, xp: 0 }, chopping: { level: 41, xp: 0 },
    fishing: { level: 38, xp: 0 }, smithing: { level: 33, xp: 0 },
    alchemy: { level: 28, xp: 0 }, farming: { level: 31, xp: 0 },
    cooking: { level: 26, xp: 0 },
  },
  skillTalents: {}, tools: { mining: 4, chopping: 4, fishing: 3, farming: 3 },
  tool: 'mining', autoSwitch: true, fedTier: 2, fedTimer: 480,
  raw: { copper: 900, iron: 640, gold: 380, salmon: 420, trout: 260, oak: 700, yew: 340 },
  refined: { copper: 240, iron: 180, gold: 120, oak: 210, yew: 160, grape: 140, salmon: 90 },
  // No keys in hand on purpose: an unspent key parks two big buttons over
  // the arena, and the arena is the picture in all eight shots.
  keys: {}, deepestKey: 3, bossHeld: false,
  // Tamed and levelled, because a parade of Nv 1 pets says the system is
  // new rather than deep. tamePets() only seeds what is missing.
  pets: {
    slime: 9, bat: 8, watcher: 7, hellpup: 7, cinder: 6, bones: 6, wisp: 5,
    bloodling: 5, ember: 4, imp: 4, ashbat: 3, urchin: 3, honeybear: 2,
  },
  companion: 'hellpup',
  petArmor: { slime: 3, bat: 2, hellpup: 2, bones: 1 },
  // The bestiary's whole point is that the tally is long: these are the
  // numbers a real save carries by the third awakening.
  hunts: {
    slime: 4100, bat: 3600, orc: 3200, skeleton: 2900, armored_skeleton: 2400,
    armored_orc: 2100, werewolf: 1700, greatsword_skeleton: 1400, elite_orc: 1100,
    werebear: 900, lava_slime: 640, hellbat: 520, hellhound: 410, demon_a: 260,
  },
  jewels: { haste: 2, plenty: 2, springs: 1, study: 1, midas: 1, cinders: 1 },
  trips: {}, potions: {}, dishes: {},
  stats: {
    rebirths: 8, kills: 41200, bossKills: 620, deaths: 74, forges: 980,
    refines: 5400, feeds: 260, brews: 190, dungeonClears: 44, bloodWins: 12,
  },
  quests: null, gems: 420, bestGps: 9.4e6, redeemed: [], runClock: 7200, sprintBest: 143,
  idolOwned: true, speed: 2, buyMax: true, muted: true, musicOff: true,
  // Damage numbers off for the shoot only: two floaters overlapping read
  // as a broken string, and half the shots caught one.
  floatersOff: true, lang: 'pt', goldPerSec: 0, lastSeen: Date.now(),
};

// tab, optional sub-tab click, filename, and how long to let the fight run
// before the shutter (the arena is alive in every shot).
const SHOTS = [
  ['upgrades', null, '1-combate-e-loja'],
  ['talents', '[data-tree="talents"]', '2-talentos'],
  ['skills', '[data-skill="mining"]', '3-oficios'],
  ['forge', null, '4-forja'],
  ['pets', '[data-pets="parade"]', '5-pets'],
  ['hall', null, '6-ancestrais'],
  ['awaken', '[data-lore="hunt"]', '7-bestiario'],
  ['cosmos', '[data-sky="planetarium"]', '8-singularidade'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({
  // 1152x648 is 16:9 AND inside the 560..1279 media query, so the game
  // lays itself out the way a landscape PHONE gets it (arena band on top,
  // panel under it) instead of the desktop two-column layout, which leaves
  // a fifth of a 1920 frame as empty cabinet. deviceScaleFactor 2 shoots it
  // at 2304x1296: same layout, twice the pixels, still 16:9.
  viewport: { width: Number(process.env.VW ?? 1152), height: Number(process.env.VH ?? 648) },
  deviceScaleFactor: Number(process.env.DSF ?? 2),
});

// Belt and braces: localhost never has a backend, and this makes sure a
// screenshot run can never post a fake hero to the real board.
await page.addInitScript(() => { globalThis.__LB_CONFIG = { url: '', anon: '' }; });
await page.addInitScript((s) => localStorage.setItem('little-rpg.save.v1', JSON.stringify(s)), SAVE);

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8010/index.html');
await page.waitForSelector('.loading.is-done', { timeout: 30000 });
await page.waitForTimeout(1500);      // let the fight get going

for (const [tab, sub, name] of SHOTS) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(350);
  if (sub) {
    const el = page.locator(sub).first();
    if (await el.count()) { await el.click(); await page.waitForTimeout(300); }
  }
  // Nobody buys a game off a picture of a corpse.
  await page.evaluate(() => {
    const h = globalThis.__rpg.battle.hero;
    if (h.dead) { h.dead = false; h.hp = h.maxHp; }
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`${name}.png`);
}

if (errors.length) console.log('PAGE ERRORS:', errors.join('\n'));
await browser.close();
