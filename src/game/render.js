import { FRAME, GROUND_LINE } from '../data/sprites.js';
import { fmt } from '../format.js';

// Target logical height for the arena. Characters are ~22 px tall, so this
// puts the hero at about a quarter of the arena and leaves roughly 5 body
// widths on screen, enough to watch the enemy walk in before the clash.
const TARGET_WORLD_H = 92;
// And the floor under that promise. Zoom is derived from canvas HEIGHT, so a
// tall narrow canvas zooms in and quietly shortens the stretch of road you
// can see -- the walk-in disappears and the enemy arrives already swinging.
// The CSS pins the canvas to a wide box so this rarely binds; it is here so a
// future layout change cannot starve the camera without anyone noticing.
const MIN_WORLD_W = 100;
// There is deliberately NO ceiling to go with that floor. A wide band shows a
// lot of road -- 480 units on a 1920px screen against a phone's 117 -- and
// zooming in to fix it was tried and reverted: it made the sprites huge and,
// because band height is what buys the zoom, it ate the panel. The framing
// on a wide screen is a trade with no free side; see LAYOUT in the README.
const GROUND_FROM_BOTTOM = 16;
// The ground line of the world the scenery was drawn against: 92 tall less
// the 16 under the ground. Every parallax height below is a fraction of this.
const REFERENCE_GROUND_Y = TARGET_WORLD_H - GROUND_FROM_BOTTOM;

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

// Scenery tiers. The roster descends into hell at stage 64 and bottoms out
// past 150, and the sky is what should say so first: the sprites alone were
// carrying the whole descent. Within a tier the palettes still swap every
// 10 stages, so the line keeps changing on the way down.
//
// `embers` flips the stars from pinpricks to warm sparks drifting upward,
// and the moon runs blood-red over hell, bone-pale over the depths.
const BIOME_TIERS = [
  {
    from: 1, moon: '#f6f0dc', star: '#ffffff', embers: false,
    biomes: [
      { sky: ['#1b2340', '#3d3357'], far: '#2a2743', mid: '#1d1b31', tree: '#12101f', ground: '#2f2a3d', grass: '#4a4460' },
      { sky: ['#152a2a', '#37543f'], far: '#22402f', mid: '#17301f', tree: '#0d1c12', ground: '#243a26', grass: '#3d6b3f' },
      { sky: ['#301a22', '#6b3524'], far: '#4a2320', mid: '#331717', tree: '#1d0d0c', ground: '#3d2320', grass: '#6b3b28' },
      { sky: ['#101a2c', '#24405e'], far: '#1b3350', mid: '#122238', tree: '#0a1422', ground: '#1d2c40', grass: '#2f5570' },
      { sky: ['#231533', '#4b2a5e'], far: '#33204a', mid: '#211433', tree: '#150c22', ground: '#2c1d3d', grass: '#553670' },
    ],
  },
  {
    from: 64, moon: '#d94f38', star: '#ffb37a', embers: true,
    biomes: [
      { sky: ['#2a0f0d', '#612514'], far: '#451a14', mid: '#2e100c', tree: '#1b0805', ground: '#33150f', grass: '#8a3a1e' },
      { sky: ['#331109', '#7a2d12'], far: '#521f10', mid: '#36130a', tree: '#200a04', ground: '#3a180d', grass: '#a04a1a' },
      { sky: ['#241014', '#54202c'], far: '#3d1720', mid: '#280e15', tree: '#17070c', ground: '#2e1218', grass: '#7a2c38' },
      { sky: ['#2e0d16', '#6b1f2e'], far: '#4a1622', mid: '#310d17', tree: '#1d060e', ground: '#361019', grass: '#8f2f3a' },
      { sky: ['#1f0c0a', '#4a1c0e'], far: '#38140c', mid: '#250c07', tree: '#150503', ground: '#2b0f0a', grass: '#6e2f16' },
    ],
  },
  {
    from: 150, moon: '#9aa3b8', star: '#aab6c8', embers: false,
    biomes: [
      { sky: ['#0e0e16', '#28242f'], far: '#1e1b28', mid: '#14121c', tree: '#0a0910', ground: '#201d28', grass: '#3d3850' },
      { sky: ['#0c1013', '#20292c'], far: '#182226', mid: '#101719', tree: '#080c0d', ground: '#1a2124', grass: '#33454a' },
      { sky: ['#0d0a15', '#241c38'], far: '#1a142a', mid: '#110d1d', tree: '#080611', ground: '#1c1628', grass: '#3a2d55' },
      { sky: ['#111013', '#2c2624'], far: '#211d1b', mid: '#151312', tree: '#0b0a09', ground: '#231f1d', grass: '#453c36' },
    ],
  },
];

/** Palette for a stage: its tier, and the 10-stage rotation inside it. */
function biomeFor(stage) {
  let tier = BIOME_TIERS[0];
  for (const t of BIOME_TIERS) if (stage >= t.from) tier = t;
  const biome = tier.biomes[Math.floor((stage - 1) / 10) % tier.biomes.length];
  return { tier, biome };
}

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 3;
    this.width = 200;
    this.height = 64;
    this.dpr = 1;
    this.grid = 3;   // resize() owns these; sane values until it first runs
    this.sky = 1;

    // scratch canvas for the white hit flash
    this.scratch = document.createElement('canvas');
    this.scratch.width = FRAME;
    this.scratch.height = FRAME;
    this.scratchCtx = this.scratch.getContext('2d');

    // Scenery layers (PixelLab art baked into masks; see assets/bg/). They
    // load in the background and the procedural silhouettes keep drawing
    // until they land, so a slow disk never blanks the arena.
    this.layers = null;
    this._tintCache = new Map();
    this.loadScenery();
  }

  /**
   * The background art is shipped as WHITE alpha masks and tinted at draw
   * time with the biome's own colours -- one set of images serves all
   * fourteen palettes, and hell keeps looking like hell for free.
   */
  loadScenery() {
    const one = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = globalThis.__ASSET_MAP?.[src] ?? src;
    });
    Promise.all([
      one('assets/bg/far.png'), one('assets/bg/mid.png'), one('assets/bg/trees.png'),
      one('assets/bg/ground.png'), one('assets/bg/moon.png'),
      one('assets/bg/node_vein.png'), one('assets/bg/node_tree.png'),
      one('assets/bg/node_pool.png'), one('assets/bg/node_plot.png'),
    ]).then(([far, mid, trees, ground, moon, vein, tree, pool, plot]) => {
      if (far && mid && trees && ground && moon) {
        this.layers = { far, mid, trees, ground, moon };
        if (vein && tree && pool && plot) {
          this.layers.nodes = { vein, tree, pool, plot };
        }
      }
    });
  }

  /**
   * Gathering-node sprite tinted to a RESOURCE. The tintable part ships
   * keyed in two magentas (lit #ff00ff, shaded #b000b0); this swaps them
   * for the resource's colour and a darker cut of it, once per pair.
   */
  nodeSprite(kind, color) {
    const key = `node|${kind}|${color}`;
    let out = this._tintCache.get(key);
    if (out) return out;
    const img = this.layers.nodes[kind];
    out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    const c = out.getContext('2d');
    c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, out.width, out.height);
    const px = data.data;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      if (px[i] === 255 && px[i + 1] === 0 && px[i + 2] === 255) {
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
      } else if (px[i] === 176 && px[i + 1] === 0 && px[i + 2] === 176) {
        px[i] = (r * 0.62) | 0; px[i + 1] = (g * 0.62) | 0; px[i + 2] = (b * 0.62) | 0;
      }
    }
    c.putImageData(data, 0, 0);
    this._tintCache.set(key, out);
    return out;
  }

  /** A mask filled with `color`, cached per (layer, colour). */
  tinted(name, img, color, alpha = 0.6) {
    const key = `${name}|${color}`;
    let out = this._tintCache.get(key);
    if (out) return out;
    out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    const c = out.getContext('2d');
    c.drawImage(img, 0, 0);
    // Masks are solid white, so 'source-in' paints the silhouette; the moon
    // keeps its craters through 'source-atop' at partial strength.
    c.globalCompositeOperation = name === 'moon' ? 'source-atop' : 'source-in';
    if (name === 'moon') c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(0, 0, out.width, out.height);
    this._tintCache.set(key, out);
    return out;
  }

  /** Tiles one parallax band across the view, snapped to device pixels. */
  tileLayer(name, img, color, parallax, camX, baseY, worldH) {
    const { ctx } = this;
    const tile = this.tinted(name, img, color);
    const dh = Math.round(worldH);
    const dw = Math.max(1, Math.round(img.width * (dh / img.height)));
    let x = -(((camX * parallax) % dw + dw) % dw);
    for (; x < this.width; x += dw) {
      ctx.drawImage(tile, this.q(x), Math.round(baseY - dh), dw, dh);
    }
  }

  /** Recomputes the logical resolution. Returns the visible world width. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // Height picks the zoom; width vetoes it. `floor` on the width term, not
    // `round`: rounding UP is exactly the case that lands the world under
    // MIN_WORLD_W, which is the number the term exists to protect.
    const byHeight = Math.round(cssH / TARGET_WORLD_H);
    const byWidth = Math.floor(cssW / MIN_WORLD_W);
    this.scale = Math.min(6, Math.max(2, Math.min(byHeight, byWidth)));

    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.cssW = cssW;
    this.cssH = cssH;
    this.width = cssW / this.scale;
    this.height = cssH / this.scale;
    this.groundY = this.height - GROUND_FROM_BOTTOM;
    // Device pixels per world unit: the grid everything that MOVES snaps to.
    this.grid = this.dpr * this.scale;
    // How much sky there is to fill, against the world the art was drawn for.
    // The parallax heights were literals -- 46 units of far hill over a 72
    // unit ground line -- which is two thirds of a phone's sky and a fifth of
    // a 1440p column's. The bands scale with the sky instead, so the same
    // silhouette sits at the same HEIGHT in the frame at any size. Floored at
    // 1 so no screen ever gets less scenery than the phone was drawn with.
    this.sky = Math.max(1, Math.min(2, this.groundY / REFERENCE_GROUND_Y));
    return this.width;
  }

  /**
   * Snap a world coordinate to the screen's pixel grid, not the world's.
   *
   * Everything used to round to whole world units, so the world only moved on
   * the frames where it had accumulated a whole unit -- 50 distinct positions
   * over 120 frames, on every screen. It reads as a stutter and it is not
   * one; the fight is running at 60. Rounding to DEVICE pixels instead makes
   * the step one screen pixel, which is 87 positions over the same 120
   * frames and is what "smooth" means here.
   *
   * It costs no sharpness. `grid` is dpr x scale, so a snapped sprite origin
   * lands on a whole device pixel and each source pixel still covers exactly
   * `grid` of them -- the art stays on the grid, only the camera gets to move
   * between world pixels.
   */
  q(v) {
    return Math.round(v * this.grid) / this.grid;
  }

  /** @param {import('./battle.js').Battle} battle */
  draw(battle, time) {
    const { ctx } = this;
    const camX = battle.camX;
    const { tier, biome } = biomeFor(battle.state.stage);

    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    this.drawBackground(camX, biome, tier, time);
    this.drawProps(battle, camX, time);
    this.drawNodes(battle, camX);

    for (const corpse of battle.corpses) this.drawActor(corpse, camX, { fade: corpse.corpseTimer });
    if (battle.enemy) this.drawActor(battle.enemy, camX);
    // The parade draws back-to-front so each pet tucks behind the one
    // ahead of it, and all of them behind their owner.
    for (let i = battle.petActors.length - 1; i >= 0; i--) {
      this.drawActor(battle.petActors[i], camX);
    }
    this.drawActor(battle.hero, camX);

    this.drawBars(battle, camX);

    // Text goes on top at screen resolution so it stays readable at any zoom.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawFloaters(battle, camX);
  }

  // --- scenery ------------------------------------------------------
  drawBackground(camX, biome, tier, time) {
    const { ctx, width: W, height: H, groundY } = this;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, biome.sky[0]);
    sky.addColorStop(1, biome.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars, or over hell, embers drifting up out of the ground haze.
    ctx.fillStyle = tier.star;
    const field = groundY - 14;
    for (let i = 0; i < 40; i++) {
      const sx = (hash(i) * 400 - camX * 0.05) % 400;
      const x = sx < 0 ? sx + 400 : sx;
      if (x > W) continue;
      let y = hash(i + 900) * field;
      if (tier.embers) {
        y = (y - time * (3 + hash(i + 31) * 5)) % field;
        if (y < 0) y += field;
      }
      ctx.globalAlpha = 0.25 + hash(i + 77) * 0.5;
      ctx.fillRect(this.q(x), this.q(y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // moon: bone over the overworld, blood over hell, ash in the depths.
    // A cratered sprite when the art has landed, the plain disc until then.
    const moonX = 20 - ((camX * 0.02) % (W + 60));
    if (this.layers) {
      const d = Math.round(11 * this.sky);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.tinted('moon', this.layers.moon, tier.moon),
        this.q(moonX + W * 0.7 - d / 2), Math.round(12 * this.sky - d / 2), d, d);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = tier.moon;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(moonX + W * 0.7, 12 * this.sky, 5 * this.sky, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.layers) {
      // The PixelLab bands: ridge, wooded hills, pine treeline -- shipped
      // as masks, tinted with this biome's own far/mid/tree colours, and
      // mirror-baked so the tiling has no seam to find.
      this.tileLayer('far', this.layers.far, biome.far, 0.15, camX, groundY + 2, 52 * this.sky);
      this.tileLayer('mid', this.layers.mid, biome.mid, 0.38, camX, groundY + 2, 34 * this.sky);
      this.tileLayer('trees', this.layers.trees, biome.tree, 0.62, camX, groundY + 1, 24 * this.sky);
    } else {
      // The seeds stay 26 and 16: they are what makes the two bands
      // different silhouettes, and they must not move when the heights do.
      this.drawHills(camX * 0.15, groundY + 2, 26 * this.sky, 46 * this.sky, biome.far, 26);
      this.drawHills(camX * 0.38, groundY + 2, 16 * this.sky, 31 * this.sky, biome.mid, 16);
      this.drawTrees(camX * 0.62, groundY, biome.tree);
    }

    // ground
    ctx.fillStyle = biome.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = biome.grass;
    ctx.fillRect(0, groundY, W, 2);

    if (this.layers) {
      // Real dirt: a detail map (translucent darks and lights) laid over
      // the biome's ground colour, scrolling with the world at full speed.
      const g = this.layers.ground;
      const dw = g.width;
      let x = -(((camX % dw) + dw) % dw);
      for (; x < W; x += dw) {
        ctx.drawImage(g, this.q(x), groundY, dw, GROUND_FROM_BOTTOM);
      }
    } else {
      // ground detail (scrolls with the world)
      ctx.fillStyle = '#00000038';
      const step = 7;
      const first = Math.floor(camX / step);
      for (let k = first; k * step - camX < W + step; k++) {
        const r = hash(k * 31 + 5);
        if (r > 0.55) continue;
        const x = this.q(k * step - camX + r * 4);
        ctx.fillRect(x, groundY + 4 + Math.floor(r * 8), 2 + Math.floor(r * 4), 1);
      }
    }

    // foreground grass tufts
    ctx.fillStyle = biome.grass;
    for (let k = Math.floor(camX / 11); k * 11 - camX < W + 11; k++) {
      const r = hash(k * 17 + 3);
      if (r > 0.45) continue;
      const x = this.q(k * 11 - camX);
      const h = 2 + Math.floor(r * 6);
      const sway = Math.sin(time * 1.6 + k) * 0.5;
      ctx.fillRect(this.q(x + sway), groundY - h + 1, 1, h);
      ctx.fillRect(x + 1, groundY - h + 3, 1, h - 2);
    }
  }

  /**
   * `seed` is what makes the two parallax bands different silhouettes. It
   * used to be derived from `minH`, which worked only because 26 and 16
   * round to different integers -- give the bands the same minimum, or a
   * fractional one, and the near band becomes a copy of the far one sliding
   * at a different speed. Naming it stops that from being an accident.
   */
  drawHills(offset, baseY, minH, maxH, color, seed = 0) {
    const { ctx, width: W } = this;
    const span = 34;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-span, baseY);
    const first = Math.floor(offset / span) - 1;
    for (let k = first; k * span - offset < W + span * 2; k++) {
      const x = k * span - offset;
      const h = minH + hash(k * 7 + seed) * (maxH - minH);
      ctx.lineTo(x, baseY - h * 0.35);
      ctx.lineTo(x + span * 0.5, baseY - h);
      ctx.lineTo(x + span, baseY - h * 0.3);
    }
    ctx.lineTo(W + span, baseY);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Height scales with the sky; SPACING does not. Scaling the span too
   * thinned the treeline out -- the same one-in-three filter over a stride
   * half again as long is half the trees across the same stretch of road.
   */
  drawTrees(offset, baseY, color) {
    const { ctx, width: W } = this;
    const span = 26;
    ctx.fillStyle = color;
    for (let k = Math.floor(offset / span) - 1; k * span - offset < W + span; k++) {
      const r = hash(k * 13 + 101);
      if (r > 0.6) continue;
      const x = this.q(k * span - offset + r * 12);
      const h = Math.round((12 + r * 14) * this.sky);
      ctx.fillRect(x, baseY - h, 2, h);
      ctx.beginPath();
      ctx.moveTo(x - 5, baseY - h + 4);
      ctx.lineTo(x + 1, baseY - h - 6);
      ctx.lineTo(x + 7, baseY - h + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- gathering nodes ----------------------------------------------
  /**
   * A vein, a tree or a fishing spot, drawn rather than blitted. The arena is
   * about 92 world px tall and a node has to read at ten pixels wide, which
   * no icon from the packs survives being scaled down to. A node you cannot
   * work yet keeps its shape but goes grey and gets a marker over it, so
   * "come back with a better tool" is legible at a glance.
   */
  /** Roadside chests and shrines, tiny and hand-pixelled like the nodes. */
  drawProps(battle, camX, time) {
    const { ctx, groundY } = this;
    for (const prop of battle.props) {
      const x = this.q(prop.x - camX);
      if (x < -16 || x > this.width + 16) continue;
      if (prop.kind === 'chest') {
        // a squat box with a gold band and a keyhole glint
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(x - 4, groundY - 6, 9, 6);
        ctx.fillStyle = '#7a4f2c';
        ctx.fillRect(x - 4, groundY - 6, 9, 2);
        ctx.fillStyle = '#ebb85b';
        ctx.fillRect(x - 4, groundY - 4, 9, 1);
        ctx.fillStyle = '#ffe9ae';
        ctx.fillRect(x, groundY - 4, 1, 1);
      } else if (prop.kind === 'merchant') {
        // a hand cart under a striped awning
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(x - 5, groundY - 5, 10, 4);        // cart bed
        ctx.fillStyle = '#3b3b4a';
        ctx.fillRect(x - 3, groundY - 2, 2, 2);         // wheels
        ctx.fillRect(x + 2, groundY - 2, 2, 2);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(x - 5, groundY - 8, 1, 3);         // awning posts
        ctx.fillRect(x + 4, groundY - 8, 1, 3);
        ctx.fillStyle = '#b74132';
        ctx.fillRect(x - 6, groundY - 10, 12, 2);       // awning
        ctx.fillStyle = '#e6dccb';
        ctx.fillRect(x - 5, groundY - 9, 2, 1);         // stripes
        ctx.fillRect(x - 1, groundY - 9, 2, 1);
        ctx.fillRect(x + 3, groundY - 9, 2, 1);
      } else if (prop.kind === 'caravan') {
        // a stranded covered wagon with a torn red rag
        ctx.fillStyle = '#7a4f2c';
        ctx.fillRect(x - 6, groundY - 6, 12, 5);        // wagon body
        ctx.fillStyle = '#3b3b4a';
        ctx.fillRect(x - 4, groundY - 2, 3, 2);         // wheels
        ctx.fillRect(x + 2, groundY - 2, 3, 2);
        ctx.fillStyle = '#dacea4';
        ctx.fillRect(x - 5, groundY - 9, 10, 3);        // canvas cover
        ctx.fillStyle = '#b74132';
        ctx.fillRect(x + 3, groundY - 10, 2, 1);        // the rag
      } else {
        // an obelisk with a breathing light on top
        ctx.fillStyle = '#3b3b4a';
        ctx.fillRect(x - 1, groundY - 12, 3, 12);
        ctx.fillStyle = '#565669';
        ctx.fillRect(x - 2, groundY - 2, 5, 2);
        const pulse = 0.55 + Math.sin(time * 3) * 0.35;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#8fd4ff';
        ctx.fillRect(x - 1, groundY - 14, 3, 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawNodes(battle, camX) {
    const { ctx, groundY } = this;
    for (const node of battle.nodes) {
      const x = this.q(node.x - camX);
      if (x < -24 || x > this.width + 24) continue;
      const nudge = node.shake > 0 ? (Math.random() < 0.5 ? 1 : 0) : 0;
      const bx = x - 5 + nudge;

      if (node.spent) {
        ctx.fillStyle = '#00000055';
        ctx.fillRect(bx + 1, groundY - 2, 8, 2);
        continue;
      }

      if (this.layers?.nodes) {
        // PixelLab sprites, tinted to the resource through the magenta key.
        // A locked node greys out instead of taking its colour.
        const color = node.locked ? '#4a4842' : node.resource.color;
        const sprite = this.nodeSprite(node.kind, color);
        ctx.globalAlpha = node.locked ? 0.6 : 1;
        if (node.kind === 'tree') ctx.drawImage(sprite, bx - 7, groundY - 25, 26, 26);
        else if (node.kind === 'vein') ctx.drawImage(sprite, bx - 2, groundY - 13, 14, 14);
        else if (node.kind === 'plot') ctx.drawImage(sprite, bx - 2, groundY - 13, 14, 14);
        else ctx.drawImage(sprite, bx - 3, groundY - 10, 16, 16);   // pool sinks in
        ctx.globalAlpha = 1;
      } else if (node.kind === 'vein') this.drawVein(bx, groundY, node);
      else if (node.kind === 'tree') this.drawTreeNode(bx, groundY, node);
      else if (node.kind === 'plot') this.drawPlot(bx, groundY, node);
      else this.drawPool(bx, groundY, node);

      if (node.locked) {
        // padlock-ish marker floating above it
        ctx.fillStyle = '#e6dccb';
        const top = groundY - (node.kind === 'tree' ? 22 : 12);
        ctx.fillRect(bx + 4, top, 4, 1);
        ctx.fillRect(bx + 5, top - 2, 2, 2);
        continue;
      }

      if (battle.working === node) {
        const done = Math.min(1, node.progress / Math.max(0.01, battle.nodeWorkTime));
        const top = groundY - (node.kind === 'tree' ? 23 : 13);
        ctx.fillStyle = '#150f0d';
        ctx.fillRect(bx, top, 11, 3);
        ctx.fillStyle = node.resource.color;
        ctx.fillRect(bx + 1, top + 1, Math.round(9 * done), 1);
      }
    }
  }

  drawVein(bx, groundY, node) {
    const { ctx } = this;
    const by = groundY - 9;
    ctx.fillStyle = node.locked ? '#3b3a3e' : '#4a3f39';
    ctx.fillRect(bx + 1, by + 2, 9, 7);
    ctx.fillRect(bx + 2, by, 7, 3);
    ctx.fillStyle = node.locked ? '#57565c' : '#6a5a4e';
    ctx.fillRect(bx + 2, by + 1, 6, 2);

    ctx.fillStyle = node.locked ? '#2f2e33' : node.resource.color;
    ctx.globalAlpha = node.locked ? 0.45 : 1;
    ctx.fillRect(bx + 3, by + 3, 2, 2);
    ctx.fillRect(bx + 6, by + 5, 2, 2);
    ctx.fillRect(bx + 4, by + 7, 1, 1);
    ctx.globalAlpha = 1;
  }

  /** Taller than the others on purpose: a tree has to read as a tree. */
  drawTreeNode(bx, groundY, node) {
    const { ctx } = this;
    ctx.fillStyle = node.locked ? '#3b352f' : '#5a3f2a';
    ctx.fillRect(bx + 4, groundY - 9, 3, 9);
    ctx.fillStyle = node.locked ? '#4a4842' : node.resource.color;
    ctx.globalAlpha = node.locked ? 0.5 : 1;
    ctx.beginPath();
    ctx.moveTo(bx - 1, groundY - 8);
    ctx.lineTo(bx + 5.5, groundY - 20);
    ctx.lineTo(bx + 12, groundY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(bx + 1, groundY - 13, 9, 4);
    ctx.globalAlpha = 1;
  }

  /** A plot is tilled rows with the crop poking out in its own colour. */
  drawPlot(bx, groundY, node) {
    const { ctx } = this;
    // the tilled mound: two ridges of turned earth
    ctx.fillStyle = node.locked ? '#3a3531' : '#4d3624';
    ctx.fillRect(bx, groundY - 2, 11, 2);
    ctx.fillStyle = node.locked ? '#453f39' : '#5f452e';
    ctx.fillRect(bx + 1, groundY - 3, 4, 1);
    ctx.fillRect(bx + 6, groundY - 3, 4, 1);
    // the crop: three sprouts in the resource's colour
    ctx.fillStyle = node.locked ? '#4a4842' : node.resource.color;
    ctx.globalAlpha = node.locked ? 0.5 : 1;
    ctx.fillRect(bx + 2, groundY - 6, 2, 3);
    ctx.fillRect(bx + 5, groundY - 7, 2, 4);
    ctx.fillRect(bx + 8, groundY - 6, 2, 3);
    // green stems under the taller heads
    if (!node.locked) {
      ctx.fillStyle = '#6dba79';
      ctx.fillRect(bx + 5, groundY - 4, 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** A pool sits IN the ground rather than on it, so it reads as water. */
  drawPool(bx, groundY, node) {
    const { ctx } = this;
    ctx.fillStyle = node.locked ? '#2a2c30' : '#1d3a4a';
    ctx.fillRect(bx, groundY + 1, 11, 4);
    ctx.fillRect(bx + 1, groundY, 9, 1);
    ctx.fillStyle = node.locked ? '#43464c' : node.resource.color;
    ctx.globalAlpha = node.locked ? 0.5 : 0.9;
    ctx.fillRect(bx + 2, groundY + 2, 3, 1);
    ctx.fillRect(bx + 6, groundY + 3, 3, 1);
    ctx.globalAlpha = 1;
  }

  // --- actors -------------------------------------------------------
  drawActor(actor, camX, { fade = null } = {}) {
    const { ctx } = this;
    const sheet = actor.anim.sheet;
    if (!sheet) return;

    const frame = actor.anim.frame;
    const sx = frame * FRAME;
    const hover = actor.hover ? Math.sin(performance.now() / 260 + actor.bob) * 1.5 - actor.hover : 0;
    const dx = this.q(actor.x - camX - FRAME / 2);
    const dy = this.q(this.groundY - GROUND_LINE + hover);
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

    if (actor.champion) {
      this.drawTint(sheet.image, sx, dx, dy, actor.facing, actor.champion.color, 0.32, scale);
    }
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
  /** The champion tint: the sprite re-drawn in its colour at low alpha. */
  drawTint(image, sx, dx, dy, facing, color, alpha, scale = 1) {
    const { scratchCtx: s, ctx } = this;
    s.clearRect(0, 0, FRAME, FRAME);
    s.globalCompositeOperation = 'source-over';
    s.drawImage(image, sx, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
    s.globalCompositeOperation = 'source-atop';
    s.fillStyle = color;
    s.fillRect(0, 0, FRAME, FRAME);

    ctx.save();
    ctx.globalAlpha = alpha;
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
    const px = this.q(x);
    const py = this.q(y);
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
    // Champion banners still show: they are an event, not a damage number.
    const numbersOff = battle.state.floatersOff;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const f of battle.floaters) {
      if (numbersOff && f.kind !== 'champ') continue;
      const t = f.life / 0.9;
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const style = FLOATER_STYLE[f.kind];
      const x = (f.x - camX) * S;
      const y = (this.groundY - (f.base ?? 26) + f.y) * S;
      // Crits have to LOOK bigger than hits -- it is the game's whole "that
      // one landed" signal. A flat ceiling of 26 met both at scale 4 and up,
      // so the two became the same size exactly when the zoom got good.
      const size = Math.max(11, Math.min(40, style.size * Math.sqrt(S) * 0.55));

      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(size)}px ui-monospace, Menlo, monospace`;
      ctx.lineWidth = Math.max(2, S * 0.6);
      ctx.strokeStyle = '#000000cc';
      const text = typeof f.value === 'string' ? f.value : style.prefix + fmt(f.value);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = f.color ?? style.color;
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

const FLOATER_STYLE = {
  champ:  { color: '#ffd75e', size: 24, prefix: '' },
  hit:    { color: '#fff3d6', size: 22, prefix: '' },
  crit:   { color: '#ffd24a', size: 30, prefix: '' },
  gold:   { color: '#8bd450', size: 20, prefix: '+' },
  player: { color: '#ff7b6b', size: 22, prefix: '-' },
  dust:   { color: '#c79ae8', size: 20, prefix: '+' },
  ore:    { color: '#dacea4', size: 20, prefix: '+' },
};
