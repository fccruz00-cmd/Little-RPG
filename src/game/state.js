import {
  STATS, statValue, statCost, statCostBulk, statMaxLevel, affordableLevels, OFFLINE,
} from '../data/balance.js';
import { LEVELS, xpToNext } from '../data/levels.js';
import { TALENT_TREE, RELIC_TREE, SOUL_TREE, BONUS_KEYS, relicCost, soulCost } from '../data/talents.js';
import { relicsEarnedAt, soulsEarnedAt } from '../data/prestige.js';
import { KILLS_PER_STAGE } from '../data/enemies.js';
import {
  SLOTS, RARITIES, LEGENDARY, DUST, SET_BONUS, setRarity, craftCost, rollRarity, gearValue,
} from '../data/gear.js';
import {
  SKILLS, SKILL_IDS, GATHER_IDS, SKILL_TREES, GATHER, GATHER_KEYS, GATHER_MULS,
  MEAL, SMITH, TOOL_TIERS, ORES, LOGS, toolCost, gatherXpToNext, refineCost,
} from '../data/gathering.js';
import { KEYS, KEY_BY_TIER } from '../data/dungeon.js';
import { PETS, PET_BY_ID, petFeedCost } from '../data/pets.js';
import { POTIONS, POTION_BY_ID, POTION_COSTS } from '../data/potions.js';
import {
  WARE_BY_ID, GEM_FIRST, CACHE_SECONDS, SKIP_SECONDS, CHEST_FLOOR,
} from '../data/gems.js';
import { FEATS, featDone, emptyStats } from '../data/feats.js';

/** Bonus keys that stack by multiplying; everything else adds up. */
const MULTIPLIER_KEYS = [
  'dmgMul', 'atkSpeedMul', 'hpMul', 'regenMul', 'goldMul', 'xpMul', 'moveMul',
  'damageTaken', 'respawnMul', 'dustMul', 'feedLess', 'workAll',
];

const SAVE_KEY = 'little-rpg.save.v1';
const SAVE_VERSION = 14;
const SAVE_EVERY = 5; // seconds
const REDEEMED_KEPT = 50; // purchase tokens kept against double-crediting

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

    souls: 0,
    awakens: 0,
    soulTalents: {},  // survives awakening, like the souls that bought it
    // Relics this ascension earned OFF the stage curve, which today means
    // dungeon clears. It cannot live in relicsEarned, because that doubles as
    // the offset `pendingRelics` subtracts from the curve: adding to it there
    // would silently cancel a rebirth payout the player already reached.
    extraRelics: 0,

    dust: 0,
    gear: {},        // slotId -> index of the equipped rarity
    autoCraftOn: true,

    // gathering: three skills on one set of rails
    skills: {},       // skillId -> { level, xp }
    skillTalents: {}, // skillId -> { nodeId -> ranks }
    tools: {},        // skillId -> tool tier
    raw: {},          // resourceId -> count
    refined: {},      // resourceId -> count
    tool: 'mining',   // the one equipped; only its nodes spawn
    autoSwitch: false,
    fedTier: -1,      // tier of the meal being eaten, -1 when not fed
    fedTimer: 0,

    // pets: tamed for good, fed on raw fish, all of it awaken-proof.
    // Every tamed pet's buff is on; the collection is the progression.
    pets: {},         // petId -> level (absent = not tamed yet)

    // cauldron: potion id -> seconds of effect remaining
    potions: {},

    // lifetime counters, the raw material of feats. Nothing resets them.
    stats: emptyStats(),

    // dungeons
    keys: {},         // key tier -> how many are held
    deepestKey: -1,   // deepest key tier fully cleared
    bossHeld: false,  // the boss beat you; it waits for the button

    // gems: dungeon payout, spent in the gem shop. Nothing resets them, not
    // rebirth and not awakening, because a purse you can also be sold must
    // never be emptied by a button the game asks you to press.
    gems: 0,
    // The best gold/s this save has ever held. It is what the Coin Cache is
    // priced off: the live rate is zero for the hour after a rebirth, which
    // is precisely the hour the ware exists for.
    bestGps: 0,
    // Store purchase tokens already credited. See redeemPurchase().
    redeemed: [],

    buyMax: false,
    muted: false,
    musicOff: false,
    floatersOff: false,
    lang: 'en',
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
  if (data.version >= 1 && data.version <= 13) {
    // v1: before levels/talents/prestige. v2: before the forge.
    // v3: before the ids were translated. v4: before mining.
    // v5: mining stood alone, before chopping and fishing joined it.
    // v6: before smithing. Its level and tree simply start empty, and the
    // constructor fills the new skill in, so nothing needs remapping.
    // v7: before dungeon keys and the boss hold. Both start empty too.
    // v8: before awakening; souls, awakens and extraRelics start at zero via
    // defaults, so an old save simply begins its first ascension cycle here.
    // v9: before pets; the constructor tames whatever the save has earned.
    // v10: pets followed one at a time; the equipped-pet field goes, since
    // every tamed pet is active now.
    // v11: before the cauldron; potion timers start empty via defaults.
    // v12: before gems. A zero best-rate is correct for a save that never
    // tracked one, and the purse is back-paid for clears already made, below.
    // v13: before store purchases. An empty ledger is right: a save from
    // before billing existed cannot have a purchase owed to it.
    const out = {
      ...defaults(),
      ...data,
      version: SAVE_VERSION,
      bestStage: data.bestStage ?? data.maxStage ?? 1,
      talents: renameKeys(data.talents),
      relicTalents: renameKeys(data.relicTalents),
      gear: renameKeys(data.gear),
    };
    // The first-clear bounty is paid for having gone that deep, and a save
    // that arrives here already has. Without this the most invested player
    // is the one who can never collect it: someone who had cleared every
    // tier before gems existed would start on zero and stay behind a fresh
    // save forever. `deepestKey` is monotone, so this can only run once.
    const deepest = data.deepestKey ?? -1;
    if (deepest >= 0) {
      out.gems = (data.gems ?? 0)
        + GEM_FIRST.slice(0, deepest + 1).reduce((sum, n) => sum + n, 0);
    }
    // Every v5 mining node id survived the generalisation, so the ranks move
    // across untouched; only the shape around them changed.
    if (data.version === 5) {
      out.skills = { mining: { level: data.mineLevel ?? 1, xp: data.mineXp ?? 0 } };
      out.skillTalents = { mining: { ...(data.miningTalents ?? {}) } };
      out.tools = { mining: data.pick ?? 0 };
      out.raw = { ...(data.ore ?? {}) };
      out.refined = { ...(data.bars ?? {}) };
    }
    for (const k of ['mineLevel', 'mineXp', 'miningTalents', 'ore', 'bars', 'pick', 'pet']) delete out[k];
    return out;
  }
  return null;
}

export class GameState {
  constructor(data = defaults()) {
    Object.assign(this, defaults(), data);
    this.levels = { ...emptyLevels(), ...(data.levels ?? {}) };
    this.talents = { ...(data.talents ?? {}) };
    this.relicTalents = { ...(data.relicTalents ?? {}) };
    this.soulTalents = { ...(data.soulTalents ?? {}) };
    this.gear = { ...(data.gear ?? {}) };
    this.skills = Object.fromEntries(SKILL_IDS.map((id) => [id, {
      level: data.skills?.[id]?.level ?? 1,
      xp: data.skills?.[id]?.xp ?? 0,
    }]));
    this.skillTalents = Object.fromEntries(SKILL_IDS.map((id) =>
      [id, { ...(data.skillTalents?.[id] ?? {}) }]));
    this.tools = Object.fromEntries(SKILL_IDS.map((id) => [id, data.tools?.[id] ?? 0]));
    this.raw = { ...(data.raw ?? {}) };
    this.refined = { ...(data.refined ?? {}) };
    this.keys = { ...(data.keys ?? {}) };
    this.pets = { ...(data.pets ?? {}) };
    this.potions = { ...(data.potions ?? {}) };
    this.redeemed = Array.isArray(data.redeemed) ? [...data.redeemed] : [];
    this.stats = { ...emptyStats(), ...(data.stats ?? {}) };
    // Unlocks read live state, so a save from before pets existed walks out
    // of load with everything it already earned, the slime included. Silent
    // on purpose: the battle announces tames that happen live, not backlog.
    this.tamePets();
    if (!SKILLS[this.tool]?.gathers) this.tool = 'mining';
    this._gatherBonus = {};
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
    for (const branch of SOUL_TREE) for (const n of branch.nodes) apply(n, this.soulTalents[n.id] ?? 0);

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

    // Wearing every slot at one rarity or better pays the set bonus, keyed
    // by the LOWEST rarity worn: the whole board has to rise together.
    const setLevel = setRarity(this.gear);
    if (setLevel != null && SET_BONUS[setLevel]) {
      for (const [key, amount] of Object.entries(SET_BONUS[setLevel])) {
        b[key] *= 1 + amount;
      }
    }

    // Completed feats are nodes with a single permanent rank. Completion is
    // monotone (the counters only climb), so it derives instead of storing.
    for (const feat of FEATS) {
      if (featDone(feat, this.stats)) apply(feat, 1);
    }

    // Every tamed pet is one more node, with its level as the ranks, and
    // Pack Leader (soul tree) amplifies the lot. Pets fold LAST so petPower
    // is already summed whichever branch order the trees ran in.
    for (const pet of PETS) {
      const level = this.pets[pet.id];
      if (!level) continue;
      const amount = pet.per * level * (1 + b.petPower);
      if (pet.mode === 'mul') b[pet.key] *= 1 + amount;
      else b[pet.key] += amount;
    }

    this._bonus = b;
    return b;
  }

  invalidateBonus() {
    this._bonus = null;
    this._gatherBonus = {};
  }

  /**
   * One bonus object per gathering skill. The three trees reuse the same key
   * names because they mean the same thing, so they cannot share one object:
   * Swift Hands in the mining tree has to speed up mining and nothing else.
   */
  gatherBonus(skillId) {
    const cached = this._gatherBonus[skillId];
    if (cached) return cached;
    const b = Object.fromEntries(GATHER_KEYS.map((k) => [k, 0]));
    for (const k of GATHER_MULS) b[k] = 1;
    const ranksOf = this.skillTalents[skillId] ?? {};
    for (const branch of SKILL_TREES[skillId]) {
      for (const node of branch.nodes) {
        const ranks = ranksOf[node.id] ?? 0;
        if (!ranks) continue;
        const amount = node.per * ranks;
        if (node.mode === 'mul') b[node.key] *= 1 + amount;
        else if (node.mode === 'less') b[node.key] *= Math.max(0.1, 1 - amount);
        else b[node.key] += amount;
      }
    }
    // The Harvest branch of the soul tree is the one bonus source outside
    // the skill's own tree: it reaches every line at once.
    b.yieldMul *= 1 + this.bonus.yieldAll;
    b.gatherSpeed *= this.bonus.workAll;
    this._gatherBonus[skillId] = b;
    return b;
  }

  // --- derived stats ------------------------------------------------
  get damage()     { return statValue('damage', this.levels.damage) * this.bonus.dmgMul * this.potionMul('fury'); }
  get attackRate() { return statValue('attackRate', this.levels.attackRate) * this.bonus.atkSpeedMul; }
  get critChance() { return Math.min(0.95, statValue('critChance', this.levels.critChance) + this.bonus.critAdd); }
  get critPower()  { return statValue('critPower', this.levels.critPower) + this.bonus.critPowerAdd; }
  get maxHp()      { return statValue('maxHp', this.levels.maxHp) * this.bonus.hpMul; }
  get regen()      { return statValue('regen', this.levels.regen) * this.bonus.regenMul * this.fedRegenMul; }
  get goldGain()   { return statValue('goldGain', this.levels.goldGain) * this.bonus.goldMul * this.potionMul('lucky'); }
  get moveSpeed()  { return statValue('moveSpeed', this.levels.moveSpeed) * this.bonus.moveMul; }
  get xpGain()     { return this.bonus.xpMul; }
  get damageTaken(){ return this.bonus.damageTaken * this.fedArmor; }
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

  // --- gathering ----------------------------------------------------
  // All of it survives rebirth. The tool chain pays in access and conversion,
  // never in damage, so it cannot compound with the combat curve; and wiping
  // three tool lines every few hours would make them pointless.
  skill(id) {
    return this.skills[id];
  }

  gatherXpNeeded(id) {
    return gatherXpToNext(this.skills[id].level);
  }

  skillPoints(id) {
    return (this.skills[id].level - 1) * GATHER.pointsPerLevel;
  }

  skillSpent(id) {
    return Object.values(this.skillTalents[id]).reduce((sum, r) => sum + r, 0);
  }

  skillFree(id) {
    return Math.max(0, this.skillPoints(id) - this.skillSpent(id));
  }

  /** Adds XP to one skill. Returns how many levels it crossed. */
  gainGatherXp(id, amount) {
    const skill = this.skills[id];
    skill.xp += amount * this.gatherBonus(id).gatherXpMul;
    let gained = 0;
    while (skill.xp >= this.gatherXpNeeded(id)) {
      skill.xp -= this.gatherXpNeeded(id);
      skill.level += 1;
      gained += 1;
    }
    return gained;
  }

  canBuySkillTalent(id, branch, index) {
    const node = branch.nodes[index];
    const ranks = this.skillTalents[id][node.id] ?? 0;
    return ranks < node.max
      && this.skillFree(id) > 0
      && this.isUnlocked(branch, index, this.skillTalents[id]);
  }

  buySkillTalent(id, branch, index) {
    if (!this.canBuySkillTalent(id, branch, index)) return false;
    const node = branch.nodes[index];
    this.skillTalents[id][node.id] = (this.skillTalents[id][node.id] ?? 0) + 1;
    this.invalidateBonus();
    return true;
  }

  respecSkill(id) {
    this.skillTalents[id] = {};
    this.invalidateBonus();
  }

  addRaw(resourceId, amount) {
    this.raw[resourceId] = (this.raw[resourceId] ?? 0) + amount;
  }

  /**
   * Smithing's Hot Fire and Bellows cut raw-per-unit in EVERY skill, which is
   * why the multiplier is applied on top of the skill's own rather than
   * living in its tree. It is the one bonus that reaches sideways.
   */
  refineCostFor(skillId, resource) {
    const own = refineCost(resource, this.gatherBonus(skillId));
    return Math.max(2, Math.round(own * this.gatherBonus('smithing').refineAll));
  }

  /** How many refined units the raw on hand is worth right now. */
  refinable(skillId, resource) {
    return Math.floor((this.raw[resource.id] ?? 0) / this.refineCostFor(skillId, resource));
  }

  /** Refines everything it can of one resource. Returns the units produced. */
  refine(skillId, resource) {
    const made = this.refinable(skillId, resource);
    if (made <= 0) return 0;
    this.raw[resource.id] -= made * this.refineCostFor(skillId, resource);
    this.refined[resource.id] = (this.refined[resource.id] ?? 0) + made;
    this.stats.refines += made;
    // Refining is half of what Smithing does, and the half that works from
    // stage 1: the forge itself does not open until the first rebirth.
    this.gainGatherXp('smithing', made * resource.xp * SMITH.refineXp);
    return made;
  }

  // --- smithing -----------------------------------------------------
  /** How far the forge odds have been pushed up the ladder. */
  get forgeQuality() {
    return this.gatherBonus('smithing').forgeLuck;
  }

  /** Lowest rarity the forge will produce (Standards). */
  get forgeFloor() {
    return Math.round(this.gatherBonus('smithing').forgeFloor);
  }

  get forgeDiscount() {
    return this.gatherBonus('smithing').forgeCostLess;
  }

  // --- pets -----------------------------------------------------------
  /**
   * Tames every pet whose objective the save has met and does not own yet.
   * Returns the newly tamed defs so the caller can announce them. A fresh
   * tame is live immediately: its buff joins the fold on the spot.
   */
  tamePets() {
    const tamed = [];
    for (const pet of PETS) {
      if (this.pets[pet.id] || !pet.unlock.test(this)) continue;
      this.pets[pet.id] = 1;
      tamed.push(pet);
    }
    if (tamed.length) this.invalidateBonus();
    return tamed;
  }

  /** The fish this pet eats, and how many the next level costs. */
  petFood(id) {
    const pet = PET_BY_ID[id];
    const fish = SKILLS.fishing.resources[pet.fishTier];
    const cost = Math.max(1, Math.ceil(petFeedCost(this.pets[id] ?? 1) * this.bonus.feedLess));
    return { fish, cost };
  }

  canFeedPet(id) {
    if (!this.pets[id]) return false;
    const { fish, cost } = this.petFood(id);
    return (this.raw[fish.id] ?? 0) >= cost;
  }

  feedPet(id) {
    if (!this.canFeedPet(id)) return false;
    const { fish, cost } = this.petFood(id);
    this.raw[fish.id] -= cost;
    this.pets[id] += 1;
    this.stats.feeds += 1;
    this.invalidateBonus();
    return true;
  }

  // --- cauldron -------------------------------------------------------
  // Potion effects live on the timers, not in the cached bonus fold: the
  // clock moves every frame, and a cache you invalidate every frame is not
  // a cache. Two multiplications on hot getters is the cheaper trade.

  /** Deepest material band the save has seen, 0..4. Brews price off it. */
  get brewBand() {
    let band = 0;
    for (let t = 0; t < ORES.length; t++) {
      if (this.bestStage >= ORES[t].minStage) band = t;
    }
    return band;
  }

  /** What one bottle costs right now: `{dust, amount}` or `{res, amount}`. */
  potionCost(id) {
    const potion = POTION_BY_ID[id];
    const band = this.brewBand;
    const amount = POTION_COSTS[id][band];
    if (potion.resource === 'dust') return { dust: true, amount };
    const res = (potion.line === 'mining' ? ORES : LOGS)[band];
    return { res, amount };
  }

  /** Banked past two bottles: a third would be truncated by the cap. */
  brewCapped(id) {
    return (this.potions[id] ?? 0) > POTION_BY_ID[id].duration * 2;
  }

  canBrew(id) {
    if (this.brewCapped(id)) return false;
    const cost = this.potionCost(id);
    if (cost.dust) return this.forgeUnlocked && this.dust >= cost.amount;
    return (this.refined[cost.res.id] ?? 0) >= cost.amount;
  }

  brew(id) {
    if (!this.canBrew(id)) return false;
    const cost = this.potionCost(id);
    if (cost.dust) this.dust -= cost.amount;
    else this.refined[cost.res.id] -= cost.amount;
    // Brewing ahead banks up to three bottles' worth, no more: an effect
    // you can stockpile for a week is a stat with extra steps.
    const potion = POTION_BY_ID[id];
    this.potions[id] = Math.min((this.potions[id] ?? 0) + potion.duration, potion.duration * 3);
    this.stats.brews += 1;
    return true;
  }

  potionActive(id) {
    return (this.potions[id] ?? 0) > 0;
  }

  potionMul(id) {
    return this.potionActive(id) ? 1 + POTION_BY_ID[id].amount : 1;
  }

  /** Seconds the Time Draught adds to a boss clock set right now. */
  get potionBossTime() {
    return this.potionActive('time') ? POTION_BY_ID.time.amount : 0;
  }

  get activePotions() {
    return POTIONS.filter((p) => this.potionActive(p.id)).length;
  }

  tickPotions(dt) {
    for (const id in this.potions) {
      if (this.potions[id] > 0) this.potions[id] = Math.max(0, this.potions[id] - dt);
    }
  }

  // --- dungeon keys -------------------------------------------------
  // Keys are what the refined pile was for. Cost is bars AND planks of the
  // matching tier, so a key needs both gathering lines the same way a tool
  // does, and the cost curve is what stops a cleared dungeon from paying for
  // the next one outright.
  keyCost(tier) {
    const key = KEY_BY_TIER[tier];
    if (!key) return null;
    return {
      ore: ORES[tier].id, bars: key.cost.bars,
      log: LOGS[tier].id, planks: key.cost.planks,
    };
  }

  canForgeKey(tier) {
    const cost = this.keyCost(tier);
    if (!cost) return false;
    return (this.refined[cost.ore] ?? 0) >= cost.bars
      && (this.refined[cost.log] ?? 0) >= cost.planks;
  }

  forgeKey(tier) {
    if (!this.canForgeKey(tier)) return false;
    const cost = this.keyCost(tier);
    this.refined[cost.ore] -= cost.bars;
    this.refined[cost.log] -= cost.planks;
    this.keys[tier] = (this.keys[tier] ?? 0) + 1;
    // A key is smithing work like any other, and the biggest single piece.
    this.gainGatherXp('smithing', KEY_BY_TIER[tier].dust * SMITH.forgeXp);
    return true;
  }

  /** Takes one key off the ring. Returns the key it spent, or null. */
  spendKey(tier) {
    if ((this.keys[tier] ?? 0) < 1) return null;
    this.keys[tier] -= 1;
    return KEY_BY_TIER[tier];
  }

  /** Keys worth showing: the ones you can see the material for. */
  knownKeys() {
    return KEYS.filter((k) => this.bestStage >= ORES[k.tier].minStage || (this.keys[k.tier] ?? 0) > 0);
  }

  /** The tool one tier above the one in hand, or null at the top. */
  nextTool(skillId) {
    const tier = this.tools[skillId] + 1;
    return TOOL_TIERS[tier] ? { tier, cost: toolCost(tier) } : null;
  }

  canBuyTool(skillId) {
    const next = this.nextTool(skillId);
    if (!next) return false;
    return (this.refined[next.cost.ore] ?? 0) >= next.cost.bars
      && (this.refined[next.cost.log] ?? 0) >= next.cost.planks;
  }

  buyTool(skillId) {
    if (!this.canBuyTool(skillId)) return false;
    const { cost } = this.nextTool(skillId);
    this.refined[cost.ore] -= cost.bars;
    this.refined[cost.log] -= cost.planks;
    this.tools[skillId] += 1;
    return true;
  }

  /** Only the equipped skill's nodes spawn, which is the whole tradeoff. */
  equip(skillId) {
    if (!SKILLS[skillId]?.gathers || this.tool === skillId) return false;
    this.tool = skillId;
    return true;
  }

  /** Resources this skill has been deep enough to see, for the UI. */
  knownResources(skillId) {
    return (SKILLS[skillId].resources ?? []).filter((r) => this.bestStage >= r.minStage
      || (this.raw[r.id] ?? 0) > 0 || (this.refined[r.id] ?? 0) > 0);
  }

  // --- Well Fed -----------------------------------------------------
  // Fishing's payout. Meals are eaten on their own; the buff is regen and a
  // damage cut, never attack, so the sustain track cannot feed the DPS curve.
  get fed() {
    return this.fedTier >= 0 && this.fedTimer > 0;
  }

  get fedRegenMul() {
    if (!this.fed) return 1;
    const b = this.gatherBonus('fishing');
    return 1 + MEAL.regenPerTier * (this.fedTier + 1) * b.fedRegen;
  }

  get fedArmor() {
    if (!this.fed) return 1;
    const b = this.gatherBonus('fishing');
    return Math.max(0.5, 1 - (MEAL.armorPerTier * (this.fedTier + 1) + b.fedArmor));
  }

  /** Eats the best meal on hand when the last one runs out. */
  tickMeals(dt) {
    if (this.fedTimer > 0) {
      this.fedTimer -= dt;
      if (this.fedTimer > 0) return false;
    }
    this.fedTier = -1;
    for (let i = SKILLS.fishing.resources.length - 1; i >= 0; i--) {
      const fish = SKILLS.fishing.resources[i];
      if ((this.refined[fish.id] ?? 0) < 1) continue;
      this.refined[fish.id] -= 1;
      this.fedTier = fish.tier;
      this.fedTimer = MEAL.time * this.gatherBonus('fishing').mealTime;
      return true;
    }
    this.fedTimer = 0;
    return false;
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
    return craftCost(this.gear[slotId], this.forgeDiscount);
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
    const cost = this.costToForge(slotId);
    this.dust -= cost;
    // The other half of Smithing. Deep forges pay more, so the skill keeps
    // levelling once refining has flattened out.
    this.gainGatherXp('smithing', cost * SMITH.forgeXp);

    const rolled = rollRarity(this.forgeQuality, this.forgeFloor);
    this.stats.forges += 1;
    // Legendary OR BETTER. Keyed on the id, not on the top of the ladder:
    // when Mythic was added, `=== RARITIES.length - 1` silently stopped
    // counting the Legendaries the Golden Touch feat asks for.
    if (rolled >= LEGENDARY) this.stats.legendaries += 1;
    const current = this.gear[slotId];
    const better = current == null || rolled > current;

    if (better) {
      this.gear[slotId] = rolled;
      this.invalidateBonus();
      return { rolled, equipped: true, refund: 0 };
    }

    const back = DUST.scrapRefund + this.gatherBonus('smithing').scrapBack;
    const refund = Math.max(1, Math.round(craftCost(current, this.forgeDiscount) * Math.min(0.95, back)));
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

  // --- gems -----------------------------------------------------------
  // The shop. Three wares, all consumable, all priced flat. See data/gems.js
  // for why none of them is permanent and why none of them gets pricier.

  /**
   * What a ware would hand over if bought right now, and whether it can be.
   * The UI shows this number rather than a promise, because "an hour of your
   * best rate" means nothing until you can see what your best rate was.
   *
   * @returns {{amount: number, ok: boolean, why: string}}
   *   `why` is the reason a ware is greyed out, or '' when it is buyable.
   */
  gemOffer(id) {
    const ware = WARE_BY_ID[id];
    if (!ware) return { amount: 0, ok: false, why: 'unknown' };
    const paid = this.gems >= ware.cost;
    if (id === 'coin') {
      const amount = this.bestGold * CACHE_SECONDS;
      return { amount, ok: paid && amount > 0, why: amount > 0 ? '' : 'earn' };
    }
    if (id === 'skip') return { amount: SKIP_SECONDS, ok: paid, why: '' };
    // The chest aims at the weakest slot, and there is nothing to aim at
    // before the forge exists or once the whole board is already Epic.
    const slot = this.weakestSlot();
    return { amount: slot != null ? 1 : 0, ok: paid && slot != null,
      why: !this.forgeUnlocked ? 'forge' : slot != null ? '' : 'full' };
  }

  /** The best gold/s the save has held, floored by the live rate. */
  get bestGold() {
    return Math.max(this.bestGps ?? 0, this.goldPerSec ?? 0);
  }

  canBuyGem(id) {
    return this.gemOffer(id).ok;
  }

  /**
   * Buys a ware. Everything the state can settle on its own is settled here;
   * the Hourglass cannot be, because only the loop can run the fight, so it
   * comes back as `{ id: 'skip', seconds }` for the caller to play out.
   *
   * @returns {object | null} what was bought, or null when it could not be.
   */
  buyGem(id) {
    if (!this.canBuyGem(id)) return null;
    const ware = WARE_BY_ID[id];
    this.gems -= ware.cost;

    if (id === 'coin') {
      const gold = this.bestGold * CACHE_SECONDS;
      // Straight onto the pile, deliberately NOT through earn(): this is not
      // income, and letting it into the gold window would tell the offline
      // payout the hero suddenly farms an hour a second.
      this.gold += gold;
      return { id, gold };
    }
    if (id === 'skip') return { id, seconds: SKIP_SECONDS };

    const slotId = this.weakestSlot();
    // Guaranteed, not rolled. The player saw "Mythic" on the button and that
    // is what the button has to hand over, every time.
    const rolled = Math.min(CHEST_FLOOR, RARITIES.length - 1);
    this.gear[slotId] = rolled;
    this.stats.forges += 1;
    // Legendary OR BETTER. Keyed on the id, not on the top of the ladder:
    // when Mythic was added, `=== RARITIES.length - 1` silently stopped
    // counting the Legendaries the Golden Touch feat asks for.
    if (rolled >= LEGENDARY) this.stats.legendaries += 1;
    this.invalidateBonus();
    return { id, slotId, rolled };
  }

  /** Slots currently wearing the top rarity. Awakening is about to take them. */
  get mythicWorn() {
    return SLOTS.filter((slot) => this.gear[slot.id] === RARITIES.length - 1).length;
  }

  /**
   * The slot the Mythic Chest would reforge: the lowest rarity worn, empty
   * slots first, and null when every slot already sits at Mythic.
   */
  weakestSlot() {
    if (!this.forgeUnlocked) return null;
    let worst = null;
    let worstRarity = Infinity;
    for (const slot of SLOTS) {
      const rarity = this.gear[slot.id] ?? -1;
      if (rarity >= CHEST_FLOOR || rarity >= worstRarity) continue;
      worst = slot.id;
      worstRarity = rarity;
    }
    return worst;
  }

  /**
   * The one door money comes through. Store code credits gems HERE and
   * nowhere else, which is what keeps "buying gems" and "earning gems" the
   * same thing everywhere downstream.
   */
  grantGems(amount) {
    const n = Math.max(0, Math.floor(amount));
    if (!n) return 0;
    this.gems += n;
    this.save();
    return n;
  }

  /**
   * Credits one store purchase, exactly once, keyed by its purchase token.
   *
   * THIS IS WHY IT EXISTS. A consumable is only re-buyable once it has been
   * consumed, and consuming can fail: the network drops, the process dies,
   * the user force-quits between the two calls. So a purchase MUST be
   * credited before it is consumed, and anything left uneaten is re-delivered
   * on the next launch. Without this ledger that re-delivery pays twice, and
   * a player who learns to kill the app at the right moment mints gems.
   *
   * The reverse order is worse: consume-then-credit loses a purchase that
   * was paid for, and that is somebody's money.
   *
   * @returns {number} gems actually credited; 0 means already redeemed.
   */
  redeemPurchase(token, amount) {
    if (!token) return 0;
    if (this.redeemed.includes(token)) return 0;
    this.redeemed.push(token);
    // Tokens are long and the ledger only has to outlive a failed consume,
    // so the tail is all that matters. Trimming keeps the save small.
    if (this.redeemed.length > REDEEMED_KEPT) {
      this.redeemed = this.redeemed.slice(-REDEEMED_KEPT);
    }
    return this.grantGems(amount);
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

    this.resetRun();
    this.save();
    return gain;
  }

  /** The wipe both reset layers share: the gold run itself. */
  resetRun() {
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
    this.bossHeld = false;
    this.hp = this.maxHp;
  }

  // --- awakening ------------------------------------------------------
  /** Souls already committed to the tree. */
  get soulsSpent() {
    return Object.values(this.soulTalents).reduce((sum, r) => sum + r, 0);
  }

  canBuySoul(branch, index) {
    const node = branch.nodes[index];
    const ranks = this.soulTalents[node.id] ?? 0;
    return ranks < node.max
      && this.souls >= soulCost(node, ranks)
      && this.isUnlocked(branch, index, this.soulTalents);
  }

  buySoul(branch, index) {
    if (!this.canBuySoul(branch, index)) return false;
    const node = branch.nodes[index];
    const ranks = this.soulTalents[node.id] ?? 0;
    this.souls -= soulCost(node, ranks);
    this.soulTalents[node.id] = ranks + 1;
    this.invalidateBonus();
    return true;
  }

  /**
   * Every relic this ascension has earned, from all three sources: banked by
   * past rebirths, still pending in the current run, and paid out by dungeon
   * clears. This is what souls are measured against.
   */
  get cycleRelics() {
    return this.relicsEarned + this.pendingRelics + this.extraRelics;
  }

  /**
   * Souls an awakening would pay right now. Pending relics count, so
   * awakening straight off a deep run does not forfeit the rebirth it
   * skipped, and neither does a key you cleared on the way there.
   */
  get pendingSouls() {
    return soulsEarnedAt(this.cycleRelics);
  }

  /** Awaken. Returns the souls gained (0 when it did not fire). */
  awaken() {
    const gain = this.pendingSouls;
    if (gain <= 0) return 0;

    this.souls += gain;
    this.awakens += 1;

    // The relic layer goes with the run: that is the whole point of the
    // deeper reset. Wiped before resetRun so startStage (Heirloom) and
    // maxHp read the stripped tree, not the one that just vanished.
    this.relics = 0;
    this.relicsEarned = 0;
    this.extraRelics = 0;
    this.relicTalents = {};
    this.prestiges = 0;
    this.dust = 0;
    this.gear = {};

    this.resetRun();
    this.save();
    return gain;
  }

  // --- economy ------------------------------------------------------
  earn(amount) {
    const value = amount * this.goldGain;
    this.gold += value;
    // The window feeds goldPerSec, whose real job is pricing OFFLINE time.
    // It tracks the rate without the Lucky Brew: a ten-minute bottle must
    // not colour an eight-hour night at full strength.
    this._goldWindow.push({ t: this.clock, value: value / this.potionMul('lucky') });
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
    // The high-water mark the Coin Cache is priced off. It survives rebirth
    // and awakening on purpose: a ware that got worse every time the game
    // asked you to reset would be worth least exactly when you need it.
    if (this.goldPerSec > this.bestGps) this.bestGps = this.goldPerSec;
  }

  // --- persistence --------------------------------------------------
  toJSON() {
    const {
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges,
      souls, awakens, extraRelics, soulTalents,
      dust, gear, autoCraftOn,
      skills, skillTalents, tools, raw, refined, tool, autoSwitch,
      fedTier, fedTimer, keys, deepestKey, bossHeld, pets, potions, stats,
      gems, bestGps, redeemed,
      buyMax, muted, musicOff, floatersOff, lang, goldPerSec,
    } = this;
    return {
      version: SAVE_VERSION,
      gold, stage, maxStage, bestStage, kills, levels, level, xp, talents,
      relics, relicsEarned, relicTalents, prestiges,
      souls, awakens, extraRelics, soulTalents,
      dust, gear, autoCraftOn,
      skills, skillTalents, tools, raw, refined, tool, autoSwitch,
      fedTier, fedTimer, keys, deepestKey, bossHeld, pets, potions, stats,
      gems, bestGps, redeemed,
      buyMax, muted, musicOff, floatersOff, lang, goldPerSec, lastSeen: Date.now(),
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
    const away = (Date.now() - lastSeen) / 1000;
    // A drink does not keep overnight. Without this, a bottle brewed before
    // closing came back whole in the morning, every morning.
    for (const id in this.potions) {
      if (this.potions[id] > 0) this.potions[id] = Math.max(0, this.potions[id] - away);
    }
    return this.bankIdle(away);
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

  // --- save portability -----------------------------------------------
  // The save is the player's, and it lives only on their device: these two
  // are the keys that make that real. Base64 keeps clipboards and chat apps
  // from mangling the JSON; the prefix names the format so a paste of the
  // wrong thing fails loud instead of half-loading.

  exportSave() {
    this.save();
    return 'LRPG1.' + btoa(unescape(encodeURIComponent(JSON.stringify(this))));
  }

  /** Validates and stores a pasted save. Returns true when it took. */
  static importSave(text) {
    try {
      const raw = String(text ?? '').trim();
      if (!raw.startsWith('LRPG1.')) return false;
      const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(6)))));
      if (!data || typeof data !== 'object') return false;
      if (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION) return false;
      if (migrate(data) === null) return false;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  static wipe() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}
