import {
  STATS, statValue, statCost, statCostBulk, statMaxLevel, affordableLevels, OFFLINE,
} from '../data/balance.js';
import { LEVELS, xpToNext } from '../data/levels.js';
import { TALENT_TREE, RELIC_TREE, BONUS_KEYS, relicCost } from '../data/talents.js';
import { relicsEarnedAt } from '../data/prestige.js';
import { KILLS_PER_STAGE } from '../data/enemies.js';

/** Chaves de bônus que se acumulam multiplicando; o resto soma. */
const MULTIPLIER_KEYS = [
  'dmgMul', 'atkSpeedMul', 'hpMul', 'regenMul', 'goldMul', 'xpMul', 'moveMul',
  'damageTaken', 'respawnMul',
];

const SAVE_KEY = 'little-rpg.save.v1';
const SAVE_VERSION = 2;
const SAVE_EVERY = 5; // segundos

function emptyLevels() {
  return Object.fromEntries(Object.keys(STATS).map((k) => [k, 0]));
}

function defaults() {
  return {
    version: SAVE_VERSION,
    gold: 0,
    stage: 1,
    maxStage: 1,
    bestStage: 1,
    kills: 0,
    levels: emptyLevels(),

    level: 1,
    xp: 0,
    talents: {},

    relics: 0,
    relicsEarned: 0,
    relicTalents: {},
    prestiges: 0,

    buyMax: false,
    goldPerSec: 0,
    lastSeen: Date.now(),
  };
}

/** Save da v1 (antes de nível/talento/prestígio) ganha os campos novos. */
function migrate(data) {
  if (!data) return null;
  if (data.version === SAVE_VERSION) return data;
  if (data.version === 1) {
    return { ...defaults(), ...data, version: SAVE_VERSION, bestStage: data.maxStage ?? 1 };
  }
  return null;
}

export class GameState {
  constructor(data = defaults()) {
    Object.assign(this, defaults(), data);
    this.levels = { ...emptyLevels(), ...(data.levels ?? {}) };
    this.talents = { ...(data.talents ?? {}) };
    this.relicTalents = { ...(data.relicTalents ?? {}) };
    this._bonus = null;
    this.hp = this.maxHp;
    this._saveTimer = 0;
    this._goldWindow = [];
  }

  // ── bônus das árvores ─────────────────────────────────────────────
  /**
   * Junta os dois galhos de progressão num único objeto de multiplicadores.
   * Recalculado só quando um ponto é gasto — não vale a pena refazer isso a
   * cada quadro, e `damage`/`maxHp` são lidos várias vezes por quadro.
   */
  get bonus() {
    if (this._bonus) return this._bonus;
    // Multiplicadores começam em 1; somas começam em 0.
    const b = Object.fromEntries(BONUS_KEYS.map((k) => [k, 0]));
    for (const k of MULTIPLIER_KEYS) b[k] = 1;

    const apply = (node, ranks) => {
      if (!ranks) return;
      const amount = node.per * ranks;
      if (node.mode === 'mul') b[node.key] *= 1 + amount;
      else if (node.mode === 'less') b[node.key] *= Math.max(0.1, 1 - amount);
      else b[node.key] += amount;
    };
    for (const branch of TALENT_TREE) for (const n of branch.nodes) apply(n, this.talents[n.id] ?? 0);
    for (const branch of RELIC_TREE) for (const n of branch.nodes) apply(n, this.relicTalents[n.id] ?? 0);

    this._bonus = b;
    return b;
  }

  invalidateBonus() {
    this._bonus = null;
  }

  // ── atributos derivados ───────────────────────────────────────────
  get damage()     { return statValue('damage', this.levels.damage) * this.bonus.dmgMul; }
  get attackRate() { return statValue('attackRate', this.levels.attackRate) * this.bonus.atkSpeedMul; }
  get critChance() { return Math.min(0.95, statValue('critChance', this.levels.critChance) + this.bonus.critAdd); }
  get critPower()  { return statValue('critPower', this.levels.critPower) + this.bonus.critPowerAdd; }
  get maxHp()      { return statValue('maxHp', this.levels.maxHp) * this.bonus.hpMul; }
  get regen()      { return statValue('regen', this.levels.regen) * this.bonus.regenMul; }
  get goldGain()   { return statValue('goldGain', this.levels.goldGain) * this.bonus.goldMul; }
  get moveSpeed()  { return statValue('moveSpeed', this.levels.moveSpeed) * this.bonus.moveMul; }
  get xpGain()     { return this.bonus.xpMul; }
  get damageTaken(){ return this.bonus.damageTaken; }
  get respawnMul() { return this.bonus.respawnMul; }

  /** Mobs comuns antes do encontro final, já com o talento Batedor. */
  get killsPerStage() {
    return Math.max(4, KILLS_PER_STAGE - this.bonus.killsLess);
  }

  /** Fase em que uma nova corrida começa (talento Herança). */
  get startStage() {
    return 1 + this.bonus.startStage;
  }

  /** Dano médio por segundo, contando crítico. */
  get dps() {
    return this.damage * this.attackRate * (1 + this.critChance * (this.critPower - 1));
  }

  /** Sorteia um golpe: `{ damage, crit }`. */
  rollHit() {
    const crit = Math.random() < this.critChance;
    return { damage: this.damage * (crit ? this.critPower : 1), crit };
  }

  // ── nível e experiência ───────────────────────────────────────────
  get xpNeeded() {
    return xpToNext(this.level);
  }

  get totalPoints() {
    return (this.level - 1) * LEVELS.pointsPerLevel + this.bonus.extraPoints;
  }

  get spentPoints() {
    return Object.values(this.talents).reduce((sum, r) => sum + r, 0);
  }

  get freePoints() {
    return this.totalPoints - this.spentPoints;
  }

  /** Devolve quantos níveis subiu (0 se nenhum). */
  gainXp(amount) {
    this.xp += amount * this.xpGain;
    let gained = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level += 1;
      gained += 1;
    }
    return gained;
  }

  // ── árvores ───────────────────────────────────────────────────────
  /** Um nó só abre quando o anterior do mesmo galho tem ao menos 1 ponto. */
  isUnlocked(branch, index, ranksOf) {
    return index === 0 || (ranksOf[branch.nodes[index - 1].id] ?? 0) > 0;
  }

  canBuyTalent(branch, index) {
    const node = branch.nodes[index];
    const ranks = this.talents[node.id] ?? 0;
    return ranks < node.max
      && this.freePoints > 0
      && this.isUnlocked(branch, index, this.talents);
  }

  buyTalent(branch, index) {
    if (!this.canBuyTalent(branch, index)) return false;
    const node = branch.nodes[index];
    this.talents[node.id] = (this.talents[node.id] ?? 0) + 1;
    this.invalidateBonus();
    return true;
  }

  canBuyRelic(branch, index) {
    const node = branch.nodes[index];
    const ranks = this.relicTalents[node.id] ?? 0;
    return ranks < node.max
      && this.relics >= relicCost(node, ranks)
      && this.isUnlocked(branch, index, this.relicTalents);
  }

  buyRelic(branch, index) {
    if (!this.canBuyRelic(branch, index)) return false;
    const node = branch.nodes[index];
    const ranks = this.relicTalents[node.id] ?? 0;
    this.relics -= relicCost(node, ranks);
    this.relicTalents[node.id] = ranks + 1;
    this.invalidateBonus();
    return true;
  }

  /** Zera todos os talentos e devolve os pontos. */
  respecTalents() {
    this.talents = {};
    this.invalidateBonus();
  }

  // ── prestígio ─────────────────────────────────────────────────────
  get pendingRelics() {
    return Math.max(0, relicsEarnedAt(this.maxStage) - this.relicsEarned);
  }

  /** Renasce. Devolve quantas relíquias entraram (0 se não deu). */
  prestige() {
    const gain = this.pendingRelics;
    if (gain <= 0) return 0;

    this.relics += gain;
    this.relicsEarned += gain;
    this.prestiges += 1;

    this.gold = 0;
    this.levels = emptyLevels();
    this.level = 1;
    this.xp = 0;
    this.talents = {};
    this.kills = 0;
    this.goldPerSec = 0;
    this._goldWindow = [];
    this.invalidateBonus();

    this.stage = this.startStage;
    this.maxStage = this.startStage;
    this.hp = this.maxHp;
    this.save();
    return gain;
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
    const {
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges, buyMax, goldPerSec,
    } = this;
    return {
      version: SAVE_VERSION,
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges, buyMax, goldPerSec,
      lastSeen: Date.now(),
    };
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
      data = migrate(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'));
    } catch {
      data = null;
    }
    if (!data) return { state: new GameState(), offline: null };

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
