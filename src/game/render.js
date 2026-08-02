import { FRAME, GROUND_LINE } from '../data/sprites.js';
import { fmt } from '../format.js';

// Altura lógica alvo da arena. Os personagens têm ~22 px de altura visível,
// então isso põe o herói ocupando ~1/4 da arena e deixa uns 5 corpos de
// largura na tela — dá pra ver o bicho chegando antes da porrada.
const TARGET_WORLD_H = 92;
const GROUND_FROM_BOTTOM = 16;

/** Ruído determinístico: mesma entrada, mesmo cenário — sem popping. */
function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

// Paletas de bioma — trocam a cada 10 fases.
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

    // canvas auxiliar pro flash branco de acerto
    this.scratch = document.createElement('canvas');
    this.scratch.width = FRAME;
    this.scratch.height = FRAME;
    this.scratchCtx = this.scratch.getContext('2d');
  }

  /** Recalcula resolução lógica. Devolve a largura do mundo visível. */
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

    for (const corpse of battle.corpses) this.drawActor(corpse, camX, { fade: corpse.corpseTimer });
    if (battle.enemy) this.drawActor(battle.enemy, camX);
    this.drawActor(battle.hero, camX);

    this.drawBars(battle, camX);

    // Texto vai por cima, em resolução de tela (fica legível em qualquer zoom).
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFloaters(battle, camX);
  }

  // ── cenário ───────────────────────────────────────────────────────
  drawBackground(camX, biome, time) {
    const { ctx, width: W, height: H, groundY } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, biome.sky[0]);
    sky.addColorStop(1, biome.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // estrelas
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

    // lua
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

    // chão
    ctx.fillStyle = biome.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = biome.grass;
    ctx.fillRect(0, groundY, W, 2);

    // detalhes do chão (rolam junto com o mundo)
    ctx.fillStyle = '#00000038';
    const step = 7;
    const first = Math.floor(camX / step);
    for (let k = first; k * step - camX < W + step; k++) {
      const r = hash(k * 31 + 5);
      if (r > 0.55) continue;
      const x = Math.floor(k * step - camX + r * 4);
      ctx.fillRect(x, groundY + 4 + Math.floor(r * 8), 2 + Math.floor(r * 4), 1);
    }

    // tufos de grama em primeiro plano
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

  // ── atores ────────────────────────────────────────────────────────
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

    // sombra — acompanha o tamanho do bicho
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(dx + FRAME / 2, this.groundY + 1, 9 * scale, 2.5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade != null ? Math.max(0, Math.min(1, fade)) : 1;

    // Mini-chefe e chefe são desenhados maiores, crescendo a partir dos pés
    // pra continuarem pisando na mesma linha de chão.
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

  /** Silhueta branca por cima do sprite, no instante do acerto. */
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

  // ── barras de vida ────────────────────────────────────────────────
  /** Altura da barrinha que flutua logo acima da cabeça do ator. */
  headY(actor) {
    const top = actor.sprite?.top ?? 38;
    const scale = actor.scale ?? 1;
    return this.groundY - (GROUND_LINE - top) * scale - 3 - (actor.hover ?? 0) * scale;
  }

  drawBars(battle, camX) {
    const { hero, enemy } = battle;
    const W = 18;
    if (!hero.dead) {
      this.bar(hero.x - camX - W / 2, this.headY(hero), W, 2, hero.hp / hero.maxHp, '#57b03a', '#2c1f18');
    }
    if (!enemy || enemy.dead) return;

    if (enemy.isBoss) {
      // Fica abaixo do cronômetro do chefe, que é um elemento de DOM no topo.
      const w = Math.min(this.width - 24, 90);
      this.bar((this.width - w) / 2, 17, w, 4, enemy.hp / enemy.maxHp, '#d9534f', '#20141a', '#f0a63c');
    } else if (enemy.isElite) {
      // Mini-chefe: barra âmbar, mais larga que a de mob e presa nele.
      const w = 30;
      this.bar(enemy.x - camX - w / 2, this.headY(enemy) - 1, w, 3,
        enemy.hp / enemy.maxHp, '#e8862b', '#2c1f18', '#f0a63caa');
    } else {
      this.bar(enemy.x - camX - W / 2, this.headY(enemy), W, 2,
        enemy.hp / enemy.maxHp, '#c0392b', '#2c1f18');
    }
  }

  bar(x, y, w, h, ratio, fill, back, border = '#00000088') {
    const { ctx } = this;
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = border;
    ctx.fillRect(px - 1, py - 1, w + 2, h + 2);
    ctx.fillStyle = back;
    ctx.fillRect(px, py, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, Math.max(0, Math.round(w * Math.min(1, Math.max(0, ratio)))), h);
    ctx.fillStyle = '#ffffff26';
    ctx.fillRect(px, py, w, 1);
  }

  // ── números flutuantes ────────────────────────────────────────────
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
};
