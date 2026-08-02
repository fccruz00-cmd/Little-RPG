import {
  STATS, statValue, statCost, statCostBulk, statMaxLevel, affordableLevels, OFFLINE,
} from '../data/balance.js';

const SAVE_KEY = 'little-rpg.save.v1';
const SAVE_EVERY = 5; // segundos

function emptyLevels() {
  return Object.fromEntries(Object.keys(STATS).map((k) => [k, 0]));
}

function defaults() {
  return {
    version: 1,
    gold: 0,
    stage: 1,
    maxStage: 1,
    kills: 0,
    levels: emptyLevels(),
    buyMax: false,
    goldPerSec: 0,
    lastSeen: Date.now(),
  };
}

export class GameState {
  constructor(data = defaults()) {
    Object.assign(this, defaults(), data);
    this.levels = { ...emptyLevels(), ...(data.levels ?? {}) };
    this.hp = this.maxHp;
    this._saveTimer = 0;
    this._goldWindow = [];
  }

  // ── atributos derivados ───────────────────────────────────────────
  get damage()     { return statValue('damage', this.levels.damage); }
  get attackRate() { return statValue('attackRate', this.levels.attackRate); }
  get critChance() { return statValue('critChance', this.levels.critChance); }
  get critPower()  { return statValue('critPower', this.levels.critPower); }
  get maxHp()      { return statValue('maxHp', this.levels.maxHp); }
  get regen()      { return statValue('regen', this.levels.regen); }
  get goldGain()   { return statValue('goldGain', this.levels.goldGain); }
  get moveSpeed()  { return statValue('moveSpeed', this.levels.moveSpeed); }

  /** Dano médio por segundo, contando crítico. */
  get dps() {
    return this.damage * this.attackRate * (1 + this.critChance * (this.critPower - 1));
  }

  /** Sorteia um golpe: `{ damage, crit }`. */
  rollHit() {
    const crit = Math.random() < this.critChance;
    return { damage: this.damage * (crit ? this.critPower : 1), crit };
  }

  // ── economia ──────────────────────────────────────────────────────
  earn(amount) {
    const value = amount * this.goldGain;
    this.gold += value;
    this._goldWindow.push({ t: performance.now(), value });
    return value;
  }

  costOf(key) {
    return statCost(key, this.levels[key]);
  }

  /** `true` quando o atributo bateu no teto e não vale mais comprar. */
  isMaxed(key) {
    return this.levels[key] >= statMaxLevel(key);
  }

  /** Quantos níveis a compra atual leva (1, ou o máximo possível). */
  bulkFor(key) {
    if (this.isMaxed(key)) return 0;
    if (!this.buyMax) return this.gold >= this.costOf(key) ? 1 : 0;
    return affordableLevels(key, this.levels[key], this.gold);
  }

  priceFor(key, levels) {
    return levels <= 1 ? this.costOf(key) : statCostBulk(key, this.levels[key], levels);
  }

  buy(key) {
    const n = this.bulkFor(key);
    if (n <= 0) return 0;
    const price = this.priceFor(key, n);
    if (price > this.gold) return 0;
    this.gold -= price;
    const hpBefore = this.maxHp;
    this.levels[key] += n;
    // Ganhar vida máxima também cura o que foi ganho, senão o upgrade
    // parece não fazer nada no meio de uma luta.
    if (key === 'maxHp') this.hp += this.maxHp - hpBefore;
    return n;
  }

  /** Média de ouro/s dos últimos 20 s — usada no cálculo de ganho ocioso. */
  refreshGoldRate(now = performance.now()) {
    const cutoff = now - 20_000;
    while (this._goldWindow.length && this._goldWindow[0].t < cutoff) this._goldWindow.shift();
    if (this._goldWindow.length < 2) return;
    const total = this._goldWindow.reduce((sum, e) => sum + e.value, 0);
    const span = Math.max(1, (now - this._goldWindow[0].t) / 1000);
    this.goldPerSec = total / span;
  }

  // ── persistência ──────────────────────────────────────────────────
  toJSON() {
    const { version, gold, stage, maxStage, kills, levels, buyMax, goldPerSec } = this;
    return { version, gold, stage, maxStage, kills, levels, buyMax, goldPerSec, lastSeen: Date.now() };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this));
    } catch {
      /* modo privado / cota cheia: seguir sem salvar */
    }
  }

  tickAutosave(dt) {
    this._saveTimer += dt;
    if (this._saveTimer >= SAVE_EVERY) {
      this._saveTimer = 0;
      this.save();
    }
  }

  static load() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    } catch {
      data = null;
    }
    if (!data || data.version !== 1) return { state: new GameState(), offline: null };

    const state = new GameState(data);
    const offline = state.collectOffline(data.lastSeen);
    return { state, offline };
  }

  /** Credita o ouro acumulado com o jogo fechado. Devolve `{seconds, gold}`. */
  collectOffline(lastSeen) {
    if (!lastSeen || !this.goldPerSec) return null;
    const seconds = Math.min((Date.now() - lastSeen) / 1000, OFFLINE.maxHours * 3600);
    if (seconds < 60) return null;
    const gold = this.goldPerSec * seconds * OFFLINE.rate;
    this.gold += gold;
    return { seconds, gold };
  }

  static wipe() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nada a fazer */
    }
  }
}
