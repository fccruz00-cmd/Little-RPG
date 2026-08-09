// The Play banner's background is a REAL frame: the game's own renderer,
// its arena canvas forced to 1024x500, everything else hidden. Whatever
// lands here is what a player actually sees, which is the only honest
// banner. Shoot a burst and keep the frame where the fight reads best.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({
  viewport: { width: 1200, height: 700 },
  deviceScaleFactor: 1,          // exact pixels: 1024x500 means 1024x500
});

await page.addInitScript(() => localStorage.setItem('little-rpg.save.v1', JSON.stringify({
  version: 9, gold: 5e6, stage: 4, maxStage: 12, bestStage: 12, kills: 0,
  levels: { damage: 30, maxHp: 20 }, level: 12, xp: 0, talents: {},
  relics: 0, relicsEarned: 0, relicTalents: {}, prestiges: 0, souls: 0, awakens: 0,
  dust: 0, gear: {}, autoCraftOn: false, skills: {}, skillTalents: {}, tools: {},
  raw: {}, refined: {}, tool: 'mining', keys: {}, deepestKey: 0,
  muted: true, musicOff: true, floatersOff: true, lastSeen: Date.now(),
})));

await page.goto('http://localhost:8010/index.html');
await page.waitForSelector('.loading.is-done', { timeout: 30000 });

// The arena becomes the whole picture: 1024x500, nothing else on screen.
await page.addStyleTag({ content: `
  .hud, .statbar, .panel, .arena__progress, .arena__act, .arena__toast,
  .arena__boss, .rotate, .loading { display: none !important; }
  #app { padding: 0 !important; }
  .stage-col, .arena { width: 1024px !important; height: 500px !important;
                       max-width: none !important; max-height: none !important; }
  #stage { width: 1024px !important; height: 500px !important; }
` });
await page.evaluate(() => {
  const { renderer, battle } = globalThis.__rpg;
  battle.viewWidth = renderer.resize();
});
await page.waitForTimeout(500);

const names = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(320);
  // Nobody wants a corpse on the store banner: keep the hero on his feet.
  const state = await page.evaluate(() => {
    const { battle } = globalThis.__rpg;
    const h = battle.hero;
    if (h.dead) { h.dead = false; h.hp = h.maxHp; }
    return {
      heroX: Math.round(h.x), anim: h.anim?.name,
      foe: battle.enemy ? { x: Math.round(battle.enemy.x), id: battle.enemy.def?.id } : null,
    };
  });
  const name = `scene-${String(i).padStart(2, '0')}.png`;
  await page.locator('#stage').screenshot({ path: `${OUT}/${name}` });
  names.push(`${name} ${JSON.stringify(state)}`);
}

console.log(names.join('\n'));
await browser.close();
