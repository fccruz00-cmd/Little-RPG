import {
  STATS, statValue, statCost, statCostBulk, statMaxLevel, affordableLevels, OFFLINE,
} from '../data/balance.js';
import { LEVELS, xpToNext } from '../data/levels.js';
import { TALENT_TREE, RELIC_TREE, BONUS_KEYS, relicCost } from '../data/talents.js';
import { relicsEarnedAt } from '../data/prestige.js';
import { KILLS_PER_STAGE } from '../data/enemies.js';
import { SLOTS, RARITIES, DUST, craftCost, rollRarity, gearValue } from '../data/gear.js';
import {
  ORES, ORE_BY_ID, PICKS, MINING, MINING_TREE, mineXpToNext, smeltCost,
} from '../data/mining.js';

/** Bonus keys that stack by multiplying; everything else adds up. */
const MULTIPLIER_KEYS = [
  'dmgMul', 'atkSpeedMul', 'hpMul', 'regenMul', 'goldMul', 'xpMul', 'moveMul',
  'damageTaken', 'respawnMul', 'dustMul',
  'oreMul', 'nodeMul', 'mineSpeed', 'mineXpMul', 'smeltLess',
];

const SAVE_KEY = 'little-rpg.save.v1';
const SAVE_VERSION = 5;
const SAVE_EVERY = 5; // seconds

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

    dust: 0,
    gear: {},        // slotId -> index of the equipped rarity
    autoCraftOn: true,

    // mining
    mineLevel: 1,
    mineXp: 0,
    miningTalents: {},
    ore: {},          // oreId -> count
    bars: {},         // oreId -> count
    pick: 0,          // pickaxe tier

    buyMax: false,
    goldPerSec: 0,
    lastSeen: Date.now(),
  };
}

// v3 and earlier used Portuguese ids for tree nodes and gear slots. The save
// stores those ids as keys, so renaming them means remapping on load,
// otherwise every point and item silently vanishes.
const RENAMED = {
  // skill tree
  gume: 'edge', pressa: 'haste', precisao: 'precision', carnificina: 'carnage',
  couro: 'leather', folego: 'stamina', casco: 'carapace', reerguer: 'rally',
  bolso: 'pockets', saber: 'lore', passada: 'stride', batedor: 'scout',
  // relic tree
  legado: 'legacy', furiaAntiga: 'ancientFury', golpeMortal: 'deadlyStrike',
  ira: 'wrath', cofre: 'vault', sabedoria: 'wisdom', heranca: 'heirloom',
  atalho: 'shortcut', alma: 'soul', imortal: 'immortal', veterano: 'veteran',
  arauto: 'herald', coletor: 'collector', moedor: 'grinder', bigorna: 'anvil',
  golpeDuplo: 'doubleStrike', sedeSangue: 'bloodthirst', execucao: 'execute',
  emboscada: 'ambush', folga: 'respite', levantar: 'revive', marcha: 'march',
  // gear slots
  espada: 'sword', capacete: 'helmet', armadura: 'armor', calca: 'pants',
  bota: 'boots', amuleto: 'amulet', anel: 'ring',
};

function renameKeys(map) {
  if (!map) return {};
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [RENAMED[key] ?? key, value]),
  );
}

/** Old saves gain the new fields instead of being thrown away. */
function migrate(data) {
  if (!data) return null;
  if (data.version === SAVE_VERSION) return data;
  if (data.version >= 1 && data.version <= 4) {
    // v1: before levels/talents/prestige. v2: before the forge.
    // v3: before the ids were translated. v4: before mining.
    return {
      ...defaults(),
      ...data,
      version: SAVE_VERSION,
      bestStage: data.bestStage ?? data.maxStage ?? 1,
      talents: renameKeys(data.talents),
      relicTalents: renameKeys(data.relicTalents),
      gear: renameKeys(data.gear),
    };
  }
  return null;
}

export class GameState {
  constructor(data = defaults()) {
    Object.assign(this, defaults(), data);
    this.levels = { ...emptyLevels(), ...(data.levels ?? {}) };
    this.talents = { ...(data.talents ?? {}) };
    this.relicTalents = { ...(data.relicTalents ?? {}) };
    this.gear = { ...(data.gear ?? {}) };
    this.miningTalents = { ...(data.miningTalents ?? {}) };
    this.ore = { ...(data.ore ?? {}) };
    this.bars = { ...(data.bars ?? {}) };
    this._bonus = null;
    this.hp = this.maxHp;
    this._saveTimer = 0;
    this._goldWindow = [];
    // Seconds of SIMULATED time, advanced by the loop, never by the wall
    // clock. The background loop fast-forwards a minute of fighting in a few
    // milliseconds, so anything measured per second has to count game time
    // or it reads sixty times too fast.
    this.clock = 0;
  }

  // --- tree bonuses -------------------------------------------------
  /**
   * Folds both progression tracks into a single object of multipliers.
   * Recomputed only when a point is spent: redoing it every frame is not
   * worth it, and `damage`/`maxHp` are read several times per frame.
   */
  get bonus() {
    if (this._bonus) return this._bonus;
    // Multipliers start at 1; sums start at 0.
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
    for (const branch of MINING_TREE) for (const n of branch.nodes) apply(n, this.miningTalents[n.id] ?? 0);

    // Gear comes in through the same path: a slot is just one more bonus
    // source, with the value pinned by rarity.
    for (const slot of SLOTS) {
      const rarity = this.gear[slot.id];
      if (rarity == null) continue;
      const amount = gearValue(slot, rarity);
      if (slot.mode === 'mul') b[slot.key] *= 1 + amount;
      else if (slot.mode === 'less') b[slot.key] *= Math.max(0.1, 1 - amount);
      else b[slot.key] += amount;
    }

    this._bonus = b;
    return b;
  }

  invalidateBonus() {
    this._bonus = null;
  }

  // --- derived stats ------------------------------------------------
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

  /** Regular mobs before the final encounter, Scout included. */
  get killsPerStage() {
    return Math.max(4, KILLS_PER_STAGE - this.bonus.killsLess);
  }

  /** Stage a fresh run starts on (Heirloom). */
  get startStage() {
    return 1 + this.bonus.startStage;
  }

  /** Average damage per second, crits included. */
  get dps() {
    return this.damage * this.attackRate * (1 + this.critChance * (this.critPower - 1));
  }

  /** Rolls one swing: `{ damage, crit }`. */
  rollHit() {
    const crit = Math.random() < this.critChance;
    return { damage: this.damage * (crit ? this.critPower : 1), crit };
  }

  // --- level and experience -----------------------------------------
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

  /** Returns how many levels were gained (0 if none). */
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

  // --- trees --------------------------------------------------------
  /** A node opens once the previous one in the branch has 1+ point. */
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

  /** Wipes every skill point so they can be spent again. */
  respecTalents() {
    this.talents = {};
    this.invalidateBonus();
  }

  // --- mining -------------------------------------------------------
  // Mining survives rebirth on purpose. It pays in access and conversion,
  // never in damage, so it cannot compound with the combat curve; and wiping
  // it every prestige would make a long chain of picks pointless when
  // rebirths come every few hours.
  get mineXpNeeded() {
    return mineXpToNext(this.mineLevel);
  }

  get minePoints() {
    return (this.mineLevel - 1) * MINING.pointsPerLevel;
  }

  get mineSpentPoints() {
    return Object.values(this.miningTalents).reduce((sum, r) => sum + r, 0);
  }

  get mineFreePoints() {
    return Math.max(0, this.minePoints - this.mineSpentPoints);
  }

  /** Adds mining XP. Returns how many levels it crossed. */
  gainMineXp(amount) {
    this.mineXp += amount * this.bonus.mineXpMul;
    let gained = 0;
    while (this.mineXp >= this.mineXpNeeded) {
      this.mineXp -= this.mineXpNeeded;
      this.mineLevel += 1;
      gained += 1;
    }
    return gained;
  }

  canBuyMineTalent(branch, index) {
    const node = branch.nodes[index];
    const ranks = this.miningTalents[node.id] ?? 0;
    return ranks < node.max
      && this.mineFreePoints > 0
      && this.isUnlocked(branch, index, this.miningTalents);
  }

  buyMineTalent(branch, index) {
    if (!this.canBuyMineTalent(branch, index)) return false;
    const node = branch.nodes[index];
    this.miningTalents[node.id] = (this.miningTalents[node.id] ?? 0) + 1;
    this.invalidateBonus();
    return true;
  }

  respecMining() {
    this.miningTalents = {};
    this.invalidateBonus();
  }

  addOre(oreId, amount) {
    this.ore[oreId] = (this.ore[oreId] ?? 0) + amount;
  }

  smeltCostFor(oreId) {
    return smeltCost(ORE_BY_ID[oreId], this.bonus);
  }

  /** How many bars the ore on hand is worth right now. */
  smeltableBars(oreId) {
    return Math.floor((this.ore[oreId] ?? 0) / this.smeltCostFor(oreId));
  }

  /** Smelts everything it can of one ore. Returns the bars produced. */
  smelt(oreId) {
    const bars = this.smeltableBars(oreId);
    if (bars <= 0) return 0;
    this.ore[oreId] -= bars * this.smeltCostFor(oreId);
    this.bars[oreId] = (this.bars[oreId] ?? 0) + bars;
    return bars;
  }

  /** The pick one tier above the one in hand, or null at the top. */
  get nextPick() {
    return PICKS[this.pick + 1] ?? null;
  }

  canBuyPick() {
    const next = this.nextPick;
    return !!next && (this.bars[next.cost.ore] ?? 0) >= next.cost.bars;
  }

  buyPick() {
    if (!this.canBuyPick()) return false;
    const next = this.nextPick;
    this.bars[next.cost.ore] -= next.cost.bars;
    this.pick += 1;
    return true;
  }

  /** Ores the player has ever been able to see, for the UI. */
  knownOres() {
    return ORES.filter((o) => this.bestStage >= o.minStage
      || (this.ore[o.id] ?? 0) > 0 || (this.bars[o.id] ?? 0) > 0);
  }

  // --- forge --------------------------------------------------------
  /** The forge only exists after the first rebirth. */
  get forgeUnlocked() {
    return this.prestiges > 0;
  }

  /** Dust a kill yields (0 when nothing drops). */
  rollDust(kind) {
    if (!this.forgeUnlocked) return 0;
    const mul = this.bonus.dustMul;
    if (kind === 'boss') return Math.round(DUST.bossAmount * mul);
    if (kind === 'elite') return Math.round(DUST.eliteAmount * mul);
    const chance = DUST.mobChance + this.bonus.dustChance;
    return Math.random() < chance ? Math.max(1, Math.round(DUST.mobAmount * mul)) : 0;
  }

  costToForge(slotId) {
    return craftCost(this.gear[slotId]);
  }

  canForge(slotId) {
    return this.forgeUnlocked && this.dust >= this.costToForge(slotId);
  }

  /**
   * Forges a slot. Rolls the rarity, equips it when it beats what you wear
   * and refunds some dust when it does not, so there is no inventory to keep.
   * @returns {{rolled: number, equipped: boolean, refund: number} | null}
   */
  forge(slotId) {
    if (!this.canForge(slotId)) return null;
    this.dust -= this.costToForge(slotId);

    const rolled = rollRarity();
    const current = this.gear[slotId];
    const better = current == null || rolled > current;

    if (better) {
      this.gear[slotId] = rolled;
      this.invalidateBonus();
      return { rolled, equipped: true, refund: 0 };
    }

    const refund = Math.max(1, Math.round(craftCost(current) * DUST.scrapRefund));
    this.dust += refund;
    return { rolled, equipped: false, refund };
  }

  /** Cheapest slot still worth upgrading, used by the automatic forge. */
  cheapestForgeable() {
    let best = null;
    for (const slot of SLOTS) {
      if ((this.gear[slot.id] ?? -1) >= RARITIES.length - 1) continue; // already legendary
      const cost = this.costToForge(slot.id);
      if (cost <= this.dust && (best === null || cost < this.costToForge(best))) best = slot.id;
    }
    return best;
  }

  // --- prestige -----------------------------------------------------
  get pendingRelics() {
    return Math.max(0, relicsEarnedAt(this.maxStage) - this.relicsEarned);
  }

  /** Rebirth. Returns how many relics came in (0 when it did not fire). */
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

  // --- economy ------------------------------------------------------
  earn(amount) {
    const value = amount * this.goldGain;
    this.gold += value;
    this._goldWindow.push({ t: this.clock, value });
    return value;
  }

  costOf(key) {
    return statCost(key, this.levels[key]);
  }

  /** `true` once the stat hit its cap and is not worth buying. */
  isMaxed(key) {
    return this.levels[key] >= statMaxLevel(key);
  }

  /** How many levels this purchase takes (1, or as many as affordable). */
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
    // Buying max health also heals what was gained, otherwise the upgrade
    // looks like it did nothing in the middle of a fight.
    if (key === 'maxHp') this.hp += this.maxHp - hpBefore;
    return n;
  }

  /** Rolling gold/s over the last 20s of game time, used for the idle payout. */
  refreshGoldRate() {
    const cutoff = this.clock - 20;
    while (this._goldWindow.length && this._goldWindow[0].t < cutoff) this._goldWindow.shift();
    if (this._goldWindow.length < 2) return;
    const total = this._goldWindow.reduce((sum, e) => sum + e.value, 0);
    const span = Math.max(1, this.clock - this._goldWindow[0].t);
    this.goldPerSec = total / span;
  }

  // --- persistence --------------------------------------------------
  toJSON() {
    const {
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges, dust, gear, autoCraftOn,
      mineLevel, mineXp, miningTalents, ore, bars, pick,
      buyMax, goldPerSec,
    } = this;
    return {
      version: SAVE_VERSION,
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges, dust, gear, autoCraftOn,
      mineLevel, mineXp, miningTalents, ore, bars, pick,
      buyMax, goldPerSec, lastSeen: Date.now(),
    };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this));
    } catch {
      /* private mode or full quota: carry on without saving */
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

  /** Credits gold banked while the game was closed. Returns `{seconds, gold}`. */
  collectOffline(lastSeen) {
    if (!lastSeen) return null;
    return this.bankIdle((Date.now() - lastSeen) / 1000);
  }

  /**
   * Pays out a span the simulation could not cover: the game was closed, or
   * the browser froze the tab hard enough that the background loop never
   * fired. Gold only, at OFFLINE.rate, because there is no fight to read
   * kills, experience or dust from.
   */
  bankIdle(rawSeconds) {
    if (!this.goldPerSec) return null;
    const seconds = Math.min(rawSeconds, OFFLINE.maxHours * 3600);
    if (seconds < 60) return null;
    const gold = this.goldPerSec * seconds * OFFLINE.rate;
    this.gold += gold;
    return { seconds, gold };
  }

  static wipe() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}
