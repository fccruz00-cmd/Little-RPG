import { FRAME, GROUND_LINE } from '../data/sprites.js';
import { fmt } from '../format.js';

// Target logical height for the arena. Characters are ~22 px tall, so this
// puts the hero at about a quarter of the arena and leaves roughly 5 body
// widths on screen, enough to watch the enemy walk in before the clash.
const TARGET_WORLD_H = 92;
const GROUND_FROM_BOTTOM = 16;

/** Deterministic noise: same input, same scenery, no popping. */
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

// Health bar tones, read straight out of assets/ui/bar_*.png so the bars in
// the arena and the bars in the DOM are literally the same three colours.
const BAR_GREEN = ['#6dba79', '#2a7d75', '#24505f'];
const BAR_RED   = ['#e67146', '#b74132', '#7a2849'];
const BAR_GOLD  = ['#ebb85b', '#e67146', '#b74132'];
const BAR_TRACK = '#150f0d';
const BAR_RAIL_DIM = '#7a6a4e';
const BAR_TRIM = '#dacea4';   // cream rail, for the encounters worth framing

// Biome palettes, swapped every 10 stages.
const BIOMES = [
  { sky: ['#1b2340', '#3d3357'], far: '#2a2743', mid: '#1d1b31', tree: '#12101f', ground: '#2f2a3d', grass: '#4a4460' },
  { sky: ['#152a2a', '#37543f'], far: '#22402f', mid: '#17301f', tree: '#0d1c12', ground: '#243a26', grass: '#3d6b3f' },
  { sky: ['#301a22', '#6b3524'], far: '#4a2320', mid: '#331717', tree: '#1d0d0c', ground: '#3d2320', grass: '#6b3b28' },
  { sky: ['#101a2c', '#24405e'], far: '#1b3350', mid: '#122238', tree: '#0a1422', ground: '#1d2c40', grass: '#2f5570' },
  { sky: ['#231533', '#4b2a5e'], far: '#33204a', mid: '#211433', tree: '#150c22', ground: '#2c1d3d', grass: '#553670' },
];

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 3;
    this.width = 200;
    this.height = 64;
    this.dpr = 1;

    // scratch canvas for the white hit flash
    this.scratch = document.createElement('canvas');
    this.scratch.width = FRAME;
    this.scratch.height = FRAME;
    this.scratchCtx = this.scratch.getContext('2d');
  }

  /** Recomputes the logical resolution. Returns the visible world width. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = Math.min(6, Math.max(2, Math.round(cssH / TARGET_WORLD_H)));

    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.cssW = cssW;
    this.cssH = cssH;
    this.width = cssW / this.scale;
    this.height = cssH / this.scale;
    this.groundY = this.height - GROUND_FROM_BOTTOM;
    return this.width;
  }

  /** @param {import('./battle.js').Battle} battle */
  draw(battle, time) {
    const { ctx } = this;
    const camX = battle.camX;
    const biome = BIOMES[Math.floor((battle.state.stage - 1) / 10) % BIOMES.length];

    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    this.drawBackground(camX, biome, time);
    this.drawVeins(battle, camX);

    for (const corpse of battle.corpses) this.drawActor(corpse, camX, { fade: corpse.corpseTimer });
    if (battle.enemy) this.drawActor(battle.enemy, camX);
    this.drawActor(battle.hero, camX);

    this.drawBars(battle, camX);

    // Text goes on top at screen resolution so it stays readable at any zoom.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFloaters(battle, camX);
  }

  // --- scenery ------------------------------------------------------
  drawBackground(camX, biome, time) {
    const { ctx, width: W, height: H, groundY } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, biome.sky[0]);
    sky.addColorStop(1, biome.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const sx = (hash(i) * 400 - camX * 0.05) % 400;
      const x = sx < 0 ? sx + 400 : sx;
      if (x > W) continue;
      const y = hash(i + 900) * (groundY - 14);
      ctx.globalAlpha = 0.25 + hash(i + 77) * 0.5;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // moon
    const moonX = 20 - ((camX * 0.02) % (W + 60));
    ctx.fillStyle = '#f6f0dc';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(moonX + W * 0.7, 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    this.drawHills(camX * 0.15, groundY + 2, 26, 46, biome.far);
    this.drawHills(camX * 0.38, groundY + 2, 16, 31, biome.mid);
    this.drawTrees(camX * 0.62, groundY, biome.tree);

    // ground
    ctx.fillStyle = biome.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = biome.grass;
    ctx.fillRect(0, groundY, W, 2);

    // ground detail (scrolls with the world)
    ctx.fillStyle = '#00000038';
    const step = 7;
    const first = Math.floor(camX / step);
    for (let k = first; k * step - camX < W + step; k++) {
      const r = hash(k * 31 + 5);
      if (r > 0.55) continue;
      const x = Math.floor(k * step - camX + r * 4);
      ctx.fillRect(x, groundY + 4 + Math.floor(r * 8), 2 + Math.floor(r * 4), 1);
    }

    // foreground grass tufts
    ctx.fillStyle = biome.grass;
    for (let k = Math.floor(camX / 11); k * 11 - camX < W + 11; k++) {
      const r = hash(k * 17 + 3);
      if (r > 0.45) continue;
      const x = Math.floor(k * 11 - camX);
      const h = 2 + Math.floor(r * 6);
      const sway = Math.sin(time * 1.6 + k) * 0.5;
      ctx.fillRect(x + Math.round(sway), groundY - h + 1, 1, h);
      ctx.fillRect(x + 1, groundY - h + 3, 1, h - 2);
    }
  }

  drawHills(offset, baseY, minH, maxH, color) {
    const { ctx, width: W } = this;
    const span = 34;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-span, baseY);
    const first = Math.floor(offset / span) - 1;
    for (let k = first; k * span - offset < W + span * 2; k++) {
      const x = k * span - offset;
      const h = minH + hash(k * 7 + Math.round(minH)) * (maxH - minH);
      ctx.lineTo(x, baseY - h * 0.35);
      ctx.lineTo(x + span * 0.5, baseY - h);
      ctx.lineTo(x + span, baseY - h * 0.3);
    }
    ctx.lineTo(W + span, baseY);
    ctx.closePath();
    ctx.fill();
  }

  drawTrees(offset, baseY, color) {
    const { ctx, width: W } = this;
    const span = 26;
    ctx.fillStyle = color;
    for (let k = Math.floor(offset / span) - 1; k * span - offset < W + span; k++) {
      const r = hash(k * 13 + 101);
      if (r > 0.6) continue;
      const x = Math.round(k * span - offset + r * 12);
      const h = 12 + Math.round(r * 14);
      ctx.fillRect(x, baseY - h, 2, h);
      ctx.beginPath();
      ctx.moveTo(x - 5, baseY - h + 4);
      ctx.lineTo(x + 1, baseY - h - 6);
      ctx.lineTo(x + 7, baseY - h + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- ore veins ----------------------------------------------------
  /**
   * A boulder with the ore showing through it. Drawn rather than blitted,
   * because the arena is about 92 world px tall and a vein has to read at
   * ten pixels wide, which no icon from the packs survives being scaled to.
   * A locked vein keeps its ore colour but goes grey and gets a chain of
   * dots over it, so "come back with a better pick" is legible at a glance.
   */
  drawVeins(battle, camX) {
    const { ctx, groundY } = this;
    for (const vein of battle.veins) {
      const x = Math.round(vein.x - camX);
      if (x < -20 || x > this.width + 20) continue;

      const nudge = vein.shake > 0 ? (Math.random() < 0.5 ? 1 : 0) : 0;
      const bx = x - 5 + nudge;
      const by = groundY - 9;

      if (vein.spent) {
        // worked out: rubble left on the ground
        ctx.fillStyle = '#00000055';
        ctx.fillRect(bx + 1, groundY - 2, 8, 2);
        continue;
      }

      // rock body
      ctx.fillStyle = vein.locked ? '#3b3a3e' : '#4a3f39';
      ctx.fillRect(bx + 1, by + 2, 9, 7);
      ctx.fillRect(bx + 2, by, 7, 3);
      ctx.fillStyle = vein.locked ? '#57565c' : '#6a5a4e';
      ctx.fillRect(bx + 2, by + 1, 6, 2);

      // ore showing through
      ctx.fillStyle = vein.locked ? '#2f2e33' : vein.ore.color;
      ctx.globalAlpha = vein.locked ? 0.45 : 1;
      ctx.fillRect(bx + 3, by + 3, 2, 2);
      ctx.fillRect(bx + 6, by + 5, 2, 2);
      ctx.fillRect(bx + 4, by + 7, 1, 1);
      ctx.globalAlpha = 1;

      if (vein.locked) {
        ctx.fillStyle = '#e6dccb';
        ctx.fillRect(bx + 4, by - 3, 4, 1);
        ctx.fillRect(bx + 5, by - 5, 2, 2);
        continue;
      }

      // progress pips while the hero works it
      if (battle.mining === vein) {
        const done = Math.min(1, vein.progress / Math.max(0.01, battle.veinSwingTime));
        ctx.fillStyle = '#150f0d';
        ctx.fillRect(bx, by - 4, 11, 3);
        ctx.fillStyle = vein.ore.color;
        ctx.fillRect(bx + 1, by - 3, Math.round(9 * done), 1);
      }
    }
  }

  // --- actors -------------------------------------------------------
  drawActor(actor, camX, { fade = null } = {}) {
    const { ctx } = this;
    const sheet = actor.anim.sheet;
    if (!sheet) return;

    const frame = actor.anim.frame;
    const sx = frame * FRAME;
    const hover = actor.hover ? Math.sin(performance.now() / 260 + actor.bob) * 1.5 - actor.hover : 0;
    const dx = Math.round(actor.x - camX - FRAME / 2);
    const dy = Math.round(this.groundY - GROUND_LINE + hover);
    const scale = actor.scale ?? 1;

    ctx.save();
    if (fade != null) ctx.globalAlpha = Math.max(0, Math.min(1, fade));

    this.drawShadow(dx + FRAME / 2, scale, ctx.globalAlpha);
    ctx.globalAlpha = fade != null ? Math.max(0, Math.min(1, fade)) : 1;

    // Mini bosses and bosses are drawn larger, growing from the feet so
    // they keep standing on the same ground line.
    if (scale !== 1) {
      ctx.translate(dx + FRAME / 2, this.groundY);
      ctx.scale(scale, scale);
      ctx.translate(-(dx + FRAME / 2), -this.groundY);
    }

    if (actor.facing < 0) {
      ctx.translate(dx + FRAME, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet.image, sx, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
    } else {
      ctx.drawImage(sheet.image, sx, 0, FRAME, FRAME, dx, dy, FRAME, FRAME);
    }
    ctx.restore();

    if (actor.flash > 0) {
      this.drawHitFlash(sheet.image, sx, dx, dy, actor.facing, actor.flash, scale);
    }
  }

  /**
   * Ground shadow. A radial gradient rather than a flat ellipse: solid black
   * reads as a sticker glued to the floor, especially over light grass.
   */
  drawShadow(cx, scale, alpha) {
    const { ctx } = this;
    const rx = 8 * scale;
    const ry = 2.4 * scale;
    const y = this.groundY + 1;

    const grad = ctx.createRadialGradient(cx, y, 0, cx, y, rx);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.24)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -y);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** White silhouette over the sprite at the moment of impact. */
  drawHitFlash(image, sx, dx, dy, facing, amount, scale = 1) {
    const { scratchCtx: s, ctx } = this;
    s.clearRect(0, 0, FRAME, FRAME);
    s.globalCompositeOperation = 'source-over';
    s.drawImage(image, sx, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
    s.globalCompositeOperation = 'source-atop';
    s.fillStyle = '#fff';
    s.fillRect(0, 0, FRAME, FRAME);

    ctx.save();
    ctx.globalAlpha = Math.min(0.8, amount * 6);
    if (scale !== 1) {
      ctx.translate(dx + FRAME / 2, this.groundY);
      ctx.scale(scale, scale);
      ctx.translate(-(dx + FRAME / 2), -this.groundY);
    }
    if (facing < 0) {
      ctx.translate(dx + FRAME, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.scratch, 0, 0);
    } else {
      ctx.drawImage(this.scratch, dx, dy);
    }
    ctx.restore();
  }

  // --- health bars --------------------------------------------------
  /** Height of the little bar floating just above an actor's head. */
  headY(actor) {
    const top = actor.sprite?.top ?? 38;
    const scale = actor.scale ?? 1;
    return this.groundY - (GROUND_LINE - top) * scale - 3 - (actor.hover ?? 0) * scale;
  }

  drawBars(battle, camX) {
    const { hero, enemy } = battle;
    const W = 18;
    if (!hero.dead) {
      this.bar(hero.x - camX - W / 2, this.headY(hero), W, hero.hp / hero.maxHp, BAR_GREEN);
    }
    if (!enemy || enemy.dead) return;

    if (enemy.isBoss) {
      // Sits below the boss timer, which is a DOM element pinned up top.
      const w = Math.min(this.width - 24, 90);
      this.bar((this.width - w) / 2, 17, w, enemy.hp / enemy.maxHp, BAR_RED, BAR_TRIM);
    } else if (enemy.isElite) {
      // Mini boss: gold bar, wider than a mob's and pinned to it.
      this.bar(enemy.x - camX - 15, this.headY(enemy) - 1, 30, enemy.hp / enemy.maxHp, BAR_GOLD, BAR_TRIM);
    } else {
      this.bar(enemy.x - camX - W / 2, this.headY(enemy), W, enemy.hp / enemy.maxHp, BAR_RED);
    }
  }

  /**
   * Health bar drawn the way the Mini Medieval bars are: a cream rail around
   * a dark track, and a fill in three one-pixel bands. The DOM bars use the
   * sprites straight, but these are 2 to 4 px tall inside the arena, where
   * a 9-slice would land on half pixels; painting the same pixels by hand is
   * what keeps them matching the rest of the UI.
   */
  bar(x, y, w, ratio, tones, rail = BAR_RAIL_DIM) {
    const { ctx } = this;
    const px = Math.round(x);
    const py = Math.round(y);
    const h = tones.length;             // one row per tone, 3 by default
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(px - 1, py - 1, w + 2, h + 3);
    ctx.fillStyle = rail;
    ctx.fillRect(px - 1, py - 1, w + 2, 1);
    ctx.fillRect(px - 1, py + h, w + 2, 1);
    ctx.fillStyle = BAR_TRACK;
    ctx.fillRect(px, py, w, h);
    const fw = Math.max(0, Math.round(w * Math.min(1, Math.max(0, ratio))));
    for (let i = 0; i < h; i += 1) {
      ctx.fillStyle = tones[i];
      ctx.fillRect(px, py + i, fw, 1);
    }
  }

  // --- floating numbers ----------------------------------------------
  drawFloaters(battle, camX) {
    const { ctx, scale: S } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const f of battle.floaters) {
      const t = f.life / 0.9;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const style = FLOATER_STYLE[f.kind];
      const x = (f.x - camX) * S;
      const y = (this.groundY - (f.base ?? 26) + f.y) * S;
      const size = Math.max(11, Math.min(26, style.size * S * 0.32));

      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(size)}px ui-monospace, Menlo, monospace`;
      ctx.lineWidth = Math.max(2, S * 0.6);
      ctx.strokeStyle = '#000000cc';
      const text = style.prefix + fmt(f.value);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = style.color;
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

const FLOATER_STYLE = {
  hit:    { color: '#fff3d6', size: 22, prefix: '' },
  crit:   { color: '#ffd24a', size: 30, prefix: '' },
  gold:   { color: '#8bd450', size: 20, prefix: '+' },
  player: { color: '#ff7b6b', size: 22, prefix: '-' },
  dust:   { color: '#c79ae8', size: 20, prefix: '+' },
  ore:    { color: '#dacea4', size: 20, prefix: '+' },
};
