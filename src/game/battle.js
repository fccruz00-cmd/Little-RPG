import { Animator } from '../engine/anim.js';
import { SPRITES, GROUND_LINE } from '../data/sprites.js';
import {
  HERO, MOBS, mobsForStage, eliteForStage, isBossStage, bossForStage, TRAIT_FROM,
} from '../data/enemies.js';
import { LEVELS, killXp } from '../data/levels.js';
import { ENEMY, BOSS_TIME, enemyHp, enemyDamage, enemyGold } from '../data/balance.js';
import { SKILLS, GATHER_IDS, GATHER, rollResource, nodeYield, workTime } from '../data/gathering.js';
import { DUNGEON, dungeonReward } from '../data/dungeon.js';
import { PETS } from '../data/pets.js';
import { FEATS, featDone } from '../data/feats.js';

const SPAWN_MARGIN = 12;   // world px past the right edge of the screen
const RESPAWN_DELAY = 2.2; // seconds down after dying
const CORPSE_TIME = 1.1;   // how long a corpse stays on screen
const LOOT_PAUSE = 0.35;   // breather between one enemy and the next
const NODE_REACH = 5;      // world px either side of a node the hero can work

let nextId = 1;

/** An actor in the arena: hero, enemy or corpse. */
class Actor {
  constructor(def, sheets, { x, facing }) {
    this.id = nextId++;
    this.def = def;
    this.x = x;
    this.facing = facing;
    this.anim = new Animator(sheets, 'idle');
    this.sprite = SPRITES[def.id];
    this.hp = 1;
    this.maxHp = 1;
    this.flash = 0;
    this.swung = false;
    this.attackTimer = 0;
    this.dead = false;
    this.struck = false;   // has it taken the first hit yet? (Ambush)
    this.corpseTimer = 0;
    this.hover = def.hover ?? 0;
    this.bob = Math.random() * Math.PI * 2;
  }

  hurt(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.12;
    return this.hp === 0;
  }
}

/**
 * Arena simulation. It knows nothing about canvas or DOM: it only advances
 * the world and emits events the renderer and UI consume.
 */
export class Battle {
  /**
   * @param {import('./state.js').GameState} state
   * @param {Record<string, any>} actorSheets already loaded sprites
   */
  constructor(state, actorSheets) {
    this.state = state;
    this.sheets = actorSheets;
    this.listeners = {};

    this.viewWidth = 200;           // logical arena width, set on resize
    this.heroAnchor = 0.3;          // where the hero sits on screen (0..1)

    this.hero = new Actor(HERO, actorSheets[HERO.id], { x: 0, facing: 1 });
    this.hero.maxHp = state.maxHp;
    this.hero.hp = state.hp ?? state.maxHp;

    this.enemy = null;
    this.corpses = [];
    this.floaters = [];
    this.respawnTimer = 0;
    this.spawnTimer = 0;
    this.bossTimer = 0;
    this.burnTimer = 0;   // Scorch: seconds of regen still snuffed out

    // Gathering nodes live on the same line as everything else. `nextNodeX`
    // walks forward with the hero so a node is placed once and never twice.
    // Only the equipped skill's nodes spawn, which is the tradeoff: time on
    // ore is time not on wood.
    this.nodes = [];
    this.nextNodeX = this.hero.x + GATHER.spacing;
    this.working = null;   // the node being worked, with its progress
    this.switchTimer = 0;

    // The arena runs one of two things: the main line, or a dungeon. `run`
    // is that context. Everything that used to read state.stage for scaling
    // reads `this.level` instead, which is the only change the dungeon needs
    // to make in the fight itself.
    this.run = null;

    // Every tamed pet trails the hero in a little parade. Pure presence:
    // they do not fight, their buffs live in state.bonus like any node's.
    this.petActors = [];
    this._petKey = '';
    this.syncPets();

    // Feats finished before this session loaded are old news, not toasts.
    this._featsDone = new Set(FEATS.filter((f) => featDone(f, state.stats)).map((f) => f.id));

    // Loading a save keeps the kills already made: closing the game mid
    // stage does not send you back to its start.
    this.enterStage(state.stage, { silent: true, keepKills: true });
  }

  // --- events -------------------------------------------------------
  on(name, fn) {
    (this.listeners[name] ??= []).push(fn);
    return this;
  }

  emit(name, payload) {
    for (const fn of this.listeners[name] ?? []) fn(payload);
  }

  // --- stages -------------------------------------------------------
  /** Stage everything scales off: the line's stage, or the key's level. */
  get level() {
    return this.run ? this.run.key.level : this.state.stage;
  }

  get inDungeon() {
    return this.run !== null;
  }

  get isBoss() {
    return this.run ? this.run.room >= DUNGEON.rooms : isBossStage(this.state.stage);
  }

  get camX() {
    return this.hero.x - this.viewWidth * this.heroAnchor;
  }

  /**
   * Every stage ends on a final encounter: a mini boss on regular stages,
   * a real boss (with a timer) every 5.
   */
  get atFinalEncounter() {
    if (this.run) return this.run.room >= DUNGEON.rooms;
    return this.state.kills >= this.state.killsPerStage;
  }

  enterStage(stage, { silent = false, keepKills = false } = {}) {
    this.state.stage = Math.max(1, stage);
    if (!keepKills) this.state.kills = 0;
    // A reload keeps the hold; walking into a different stage clears it.
    if (!keepKills) this.state.bossHeld = false;
    this.enemy = null;
    this.corpses.length = 0;
    this.nodes.length = 0;
    this.working = null;
    this.nextNodeX = this.hero.x + GATHER.spacing * 0.5;
    this.spawnTimer = 0.4;
    this.bossTimer = 0;
    this.emit('stage', this.state.stage);
    if (!silent) {
      this.emit('toast', this.isBoss
        ? { text: `STAGE ${this.state.stage}: BOSS AHEAD`, bad: true }
        : { text: `STAGE ${this.state.stage}` });
    }
  }

  advance() {
    const next = this.state.stage + 1;
    this.state.maxStage = Math.max(this.state.maxStage, next);
    this.state.bestStage = Math.max(this.state.bestStage, next);
    this.enterStage(next);
  }

  /** Rebuilds the parade when the tamed set changes. */
  syncPets() {
    const tamed = PETS.filter((p) => this.state.pets[p.id]);
    const key = tamed.map((p) => p.id).join(',');
    if (key === this._petKey) return;
    this._petKey = key;
    this.petActors = tamed.map((pet, i) => {
      // The sprite is a roster mob; hover comes from its own def so the bat
      // pet flies exactly as high as the bat it used to be.
      const mob = MOBS.find((m) => m.id === pet.sprite);
      const def = { id: pet.sprite, petId: pet.id, hover: mob?.hover ?? 0, reach: 0, speed: 0, hit: 0 };
      const actor = new Actor(def, this.sheets[pet.sprite], {
        x: this.hero.x - 14 - i * 9, facing: 1,
      });
      actor.scale = 0.5;
      return actor;
    });
  }

  /**
   * Tames anything whose objective just completed, keeps the parade in step
   * behind the hero, and their little legs honest. Objectives complete off
   * every system (a mining level, a dungeon, a rebirth), so the check lives
   * in the tick rather than on any single event.
   */
  updatePets(dt) {
    for (const pet of this.state.tamePets()) {
      this.emit('toast', { text: `${pet.name.toUpperCase()} TAMED!` });
    }
    // Feats ride the same tick: counters move on many sites, and the ones
    // that climb in the background should still pay when they cross.
    for (const feat of FEATS) {
      if (this._featsDone.has(feat.id) || !featDone(feat, this.state.stats)) continue;
      this._featsDone.add(feat.id);
      this.state.invalidateBonus();
      this.emit('toast', { text: `FEAT: ${feat.name.toUpperCase()}` });
    }
    this.syncPets();
    const walking = this.hero.anim.name === 'walk';
    for (let i = 0; i < this.petActors.length; i++) {
      const actor = this.petActors[i];
      actor.x = this.hero.x - 14 - i * 9;
      actor.anim.play(walking ? 'walk' : 'idle', { fps: walking ? 10 : 8 });
      actor.anim.update(dt);
    }
  }

  goToStage(stage) {
    const clamped = Math.min(Math.max(1, stage), this.state.maxStage);
    if (clamped === this.state.stage) return;
    this.enterStage(clamped);
  }

  /**
   * The boss got away, or took you down.
   *
   * It used to respawn on a 1.2s timer, which turned a wall into an
   * unwatchable loop of dying to the same boss forever. Now the stage HOLDS:
   * mobs keep coming so the run still earns, and the boss waits behind a
   * button until you say go. Failing costs you the attempt, not the session.
   */
  failBoss(reason) {
    this.enemy = null;
    this.bossTimer = 0;
    this.state.hp = this.hero.hp = this.hero.maxHp;
    this.spawnTimer = 1.2;
    this.state.bossHeld = true;
    this.emit('toast', { text: reason, bad: true });
    this.emit('bossHeld', true);
  }

  /** The button. Sends the boss back in. */
  tryBoss() {
    if (!this.state.bossHeld) return false;
    this.state.bossHeld = false;
    this.enemy = null;
    this.spawnTimer = 0.3;
    this.state.hp = this.hero.hp = this.hero.maxHp;
    this.emit('toast', { text: 'AGAIN' });
    this.emit('bossHeld', false);
    return true;
  }

  // --- dungeons -----------------------------------------------------
  /** Spends the key and drops the hero into its rooms. */
  enterDungeon(tier, { bloody = false } = {}) {
    if (this.run) return false;
    // The Bloodmoon is the same rooms with the safety rail removed: no
    // regen inside, twice the payout. Only a tier already cleared offers
    // it, so it is a bet you place on a fight you have already won once.
    if (bloody && this.state.deepestKey < tier) return false;
    const key = this.state.spendKey(tier);
    if (!key) return false;
    this.run = { key, room: 1, cleared: 0, bloody };
    this.enemy = null;
    this.corpses.length = 0;
    this.nodes.length = 0;
    this.working = null;
    this.nextNodeX = this.hero.x + GATHER.spacing * 0.5;
    this.spawnTimer = 0.5;
    this.bossTimer = 0;
    this.hero.dead = false;
    this.respawnTimer = 0;
    this.state.hp = this.hero.hp = this.hero.maxHp;
    this.emit('toast', bloody
      ? { text: `BLOODMOON ${key.name.toUpperCase()}: NO REGEN, DOUBLE LOOT`, bad: true }
      : { text: `${key.name.toUpperCase()}: ${DUNGEON.rooms} ROOMS` });
    this.emit('dungeon', this.run);
    return true;
  }

  /**
   * Ends the run and pays out. A run that dies in room six is most of a win
   * rather than nothing: the key is spent either way, and wiping the whole
   * reward on an idle game you were not watching is a bad trade. Relics are
   * the exception and only pay on a full clear.
   */
  finishDungeon(won) {
    if (!this.run) return null;
    const { key, cleared, bloody } = this.run;
    const reward = dungeonReward(key, cleared, won);
    // The double is the prize for FINISHING under the moon. Doubling the
    // partial share too made leave-at-room-seven pay 1.75x a normal full
    // clear with the boss fight skipped: a bet that could not lose.
    if (bloody && won) {
      reward.relics *= 2;
      reward.dust *= 2;
      reward.goldMul *= 2;
    }
    this.state.relics += reward.relics;
    // Counted separately so awakening pays for them too: relicsEarned is the
    // stage curve's offset and cannot absorb relics the curve never granted.
    this.state.extraRelics += reward.relics;
    this.state.dust += reward.dust;
    // Priced off YOUR stage, not the key's level. A key twenty stages above
    // you would otherwise hand over twenty stages of gold inflation in one
    // run, and gold is the one thing here you can already farm. The reason
    // to run a deeper key is relics and dust.
    const gold = this.state.earn(enemyGold(Math.min(key.level, this.state.stage), 1) * reward.goldMul);
    this.state.deepestKey = won ? Math.max(this.state.deepestKey ?? -1, key.tier) : (this.state.deepestKey ?? -1);
    if (won) {
      this.state.stats.dungeonWins += 1;
      if (bloody) this.state.stats.bloodWins += 1;
    }

    this.run = null;
    this.hero.dead = false;
    this.respawnTimer = 0;
    this.state.hp = this.hero.hp = this.hero.maxHp;
    this.enterStage(this.state.stage, { silent: true, keepKills: true });
    this.emit('toast', won
      ? { text: `${key.name.toUpperCase()} CLEARED` }
      : { text: `RUN ENDED, ROOM ${cleared + 1}`, bad: true });
    this.emit('dungeon', null);
    return { ...reward, gold, won, cleared };
  }

  /** Walk out early, keeping what the cleared rooms are worth. */
  leaveDungeon() {
    return this.run ? this.finishDungeon(false) : null;
  }

  /**
   * Drops the run with no payout. Rebirth and awakening both wipe the state a
   * reward would land in, so paying one out is meaningless; what matters is
   * that `run` is cleared, because `enterStage` alone leaves it standing and
   * the hero would restart on stage 1 while the arena still scaled every
   * enemy off the key's level.
   */
  forfeitDungeon() {
    if (!this.run) return;
    this.run = null;
    this.emit('dungeon', null);
  }

  // --- spawning -----------------------------------------------------
  /** Which enemy comes next: `'mob'`, `'elite'` or `'boss'`. */
  nextEncounter() {
    // Every dungeon room is a mini boss, and the last is the boss. Filling
    // them with plain mobs made an eight room run last fifteen seconds and
    // fall over to any build that could reach the key, which is not what a
    // thing you spend a key on should feel like.
    if (this.run) return this.run.room >= DUNGEON.rooms ? 'boss' : 'elite';
    if (!this.atFinalEncounter) return 'mob';
    // Held: the stage stays farmable and the boss waits for the button.
    if (this.isBoss && this.state.bossHeld) return 'mob';
    return this.isBoss ? 'boss' : 'elite';
  }

  spawnEnemy() {
    const stage = this.level;
    const kind = this.nextEncounter();
    const pool = mobsForStage(stage);
    const def = kind === 'boss' ? bossForStage(stage)
      : kind === 'elite' ? eliteForStage(stage)
      : pool[(Math.random() * pool.length) | 0];

    // The mini boss uses flat multipliers instead of the mob's own: mobs
    // range from 0.55x to 2.6x health, and inheriting that would swing the
    // mini boss from trivial to harder than the boss depending on the stage.
    const stats = {
      mob:   { hp: def.hp,                 dmg: def.dmg,        gold: 1,               period: ENEMY.attackPeriod },
      elite: { hp: ENEMY.eliteHp,          dmg: ENEMY.eliteDmg, gold: ENEMY.eliteGold, period: ENEMY.eliteAttackPeriod },
      boss:  { hp: def.hp * ENEMY.bossHp,  dmg: def.dmg,        gold: ENEMY.bossGold,  period: ENEMY.bossAttackPeriod },
    }[kind];

    const actor = new Actor(def, this.sheets[def.id], {
      x: this.camX + this.viewWidth + SPAWN_MARGIN,
      facing: -1,
    });
    actor.kind = kind;
    actor.isBoss = kind === 'boss';
    actor.isElite = kind === 'elite';
    actor.scale = kind === 'mob' ? 1 : kind === 'elite' ? 1.3 : 1.45;
    actor.maxHp = enemyHp(stage, stats.hp) * (this.run ? DUNGEON.roomHp : 1);
    actor.hp = actor.maxHp;
    actor.damage = enemyDamage(stage, stats.dmg) * (this.run ? DUNGEON.roomDmg : 1);
    actor.gold = enemyGold(stage, stats.gold);
    actor.period = stats.period;
    actor.attackTimer = actor.period * 0.6;

    this.enemy = actor;
    // The boss timer only starts running once it walks on screen.
    if (actor.isBoss) {
      // The Time Draught reads at the moment the clock is set, so a bottle
      // drunk mid-fight pays on the NEXT attempt, not this one.
      this.bossTimer = (this.run ? DUNGEON.bossTime : BOSS_TIME)
        + this.state.bonus.bossTime + this.state.potionBossTime;
      // From TRAIT_FROM every boss fights with its one trick. The counters
      // live on the actor, so a retry starts the trick from zero too.
      if (def.trait && this.level >= TRAIT_FROM) {
        actor.trait = def.trait;
        actor.hitsTaken = 0;
        actor.swings = 0;
        actor.fightT = 0;
      }
    }
    if (actor.isElite && !this.run) this.emit('toast', { text: `MINI BOSS: ${def.name}` });
    if (actor.isBoss) {
      const trick = actor.trait ? ` \u00b7 ${actor.trait.label.toUpperCase()}` : '';
      this.emit('toast', { text: `BOSS: ${def.name}${trick}`, bad: true });
    }
    this.emit('spawn', actor);
  }

  // --- gathering nodes ----------------------------------------------
  /**
   * Places nodes ahead of the camera, one per `spacing` of ground. Spacing is
   * distance, not time, and the hero covers roughly one enemy gap per kill,
   * so nodes per minute already tracks kills per minute. That is the whole
   * coupling between gathering and combat: no second rate curve to tune.
   */
  spawnNodes() {
    const { state } = this;
    const skillId = state.tool;
    const edge = this.camX + this.viewWidth + SPAWN_MARGIN;
    const spacing = GATHER.spacing / state.gatherBonus(skillId).nodeMul;
    while (this.nextNodeX < edge) {
      const resource = rollResource(skillId, this.level, state.tools[skillId]);
      this.nodes.push({
        id: nextId++,
        x: this.nextNodeX,
        skill: skillId,
        kind: SKILLS[skillId].nodeKind,
        resource,
        locked: resource.tier > state.tools[skillId],
        progress: 0,
        spent: false,
        shake: 0,
      });
      this.nextNodeX += spacing + (Math.random() - 0.5) * GATHER.jitter;
    }
  }

  /** Seconds a swing takes right now, exposed so the renderer can draw it. */
  get nodeWorkTime() {
    const skillId = this.state.tool;
    return workTime(this.state.tools[skillId], this.state.gatherBonus(skillId));
  }

  /** The node the hero is standing on and able to work, if any. */
  nodeUnderHero() {
    const { hero, state } = this;
    for (const node of this.nodes) {
      if (node.spent || node.locked || node.skill !== state.tool) continue;
      if (Math.abs(node.x - hero.x) <= NODE_REACH) return node;
    }
    return null;
  }

  /**
   * Working a node holds the hero in place. Measured in slice 1, that costs
   * no stage progress at all, because enemies walk toward you and travel is
   * never the bottleneck. The cost that does bite is the tool slot: this only
   * ever finds nodes of the equipped skill. Combat still outranks it, so a
   * node is only worked when nothing is in range.
   */
  updateGathering(dt) {
    const { state, hero } = this;
    const node = this.nodeUnderHero();
    this.working = node;
    if (!node) return false;

    node.progress += dt;
    node.shake = 0.12;
    hero.anim.playTimed('attack', 0.5, { force: hero.anim.name !== 'attack' });
    if (node.progress < this.nodeWorkTime) return true;

    node.spent = true;
    this.working = null;
    this.harvest(node);
    return true;
  }

  harvest(node) {
    const { state } = this;
    const skillId = node.skill;
    const bonus = state.gatherBonus(skillId);
    const double = Math.random() < bonus.yieldDouble ? 2 : 1;
    const amount = nodeYield(node.resource, state.tools[skillId], bonus) * double;
    state.addRaw(node.resource.id, amount);
    this.pushFloater({ x: node.x, sprite: null, scale: 1 }, amount, 'ore');

    // The two nodes that pay a gathering skill back into the combat economy.
    // Both are flat per node, so they scale with the kill rate and nothing
    // else, which is what keeps them off the compounding curve.
    if (bonus.nodeGold > 0) {
      const gold = state.earn(enemyGold(this.level, 1) * bonus.nodeGold);
      this.pushFloater({ x: node.x, sprite: null, scale: 1 }, gold, 'gold');
    }
    if (bonus.nodeDust > 0 && Math.random() < bonus.nodeDust) {
      state.dust += 1;
      this.emit('dust', 1);
    }

    const levels = state.gainGatherXp(skillId, node.resource.xp * double);
    if (levels) {
      this.emit('toast', { text: `${SKILLS[skillId].name.toUpperCase()} ${state.skills[skillId].level}!` });
    }
    this.emit('gather', { skill: skillId, resource: node.resource, amount, levels });
  }

  updateNodes(dt) {
    this.spawnNodes();
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (node.shake > 0) node.shake -= dt;
      // A tool swap makes every node of the old skill dead weight, so they go.
      if (node.x < this.camX - 30 || node.skill !== this.state.tool) this.nodes.splice(i, 1);
    }
  }

  /** Forager, from the relic tree: rotates the tool so no line stalls. */
  updateAutoSwitch(dt) {
    const { state } = this;
    if (!state.bonus.autoSwitch || state.autoSwitch === false) return;
    this.switchTimer += dt;
    if (this.switchTimer < GATHER.switchEvery) return;
    this.switchTimer = 0;
    const next = GATHER_IDS[(GATHER_IDS.indexOf(state.tool) + 1) % GATHER_IDS.length];
    if (state.equip(next)) {
      this.working = null;
      this.emit('toast', { text: `${SKILLS[next].toolName.toUpperCase()} OUT` });
    }
  }

  // --- loop ---------------------------------------------------------
  update(dt) {
    const { state, hero } = this;

    hero.maxHp = state.maxHp;
    hero.hp = Math.min(hero.hp, hero.maxHp);
    if (hero.flash > 0) hero.flash -= dt;

    if (hero.dead) this.updateDeadHero(dt);
    else this.updateHero(dt);

    this.updateNodes(dt);
    this.updateAutoSwitch(dt);
    state.tickMeals(dt);
    state.tickPotions(dt);

    this.updateEnemy(dt);
    this.updatePets(dt);
    this.updateCorpses(dt);
    this.updateFloaters(dt);

    if (this.enemy?.isBoss && !hero.dead) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        // On the line the boss gets away and waits behind the button. In a
        // dungeon the key IS the wager: failBoss here healed the hero to
        // full and respawned the boss on a fresh clock forever, which made
        // the timer free and voided the Bloodmoon's entire stake.
        if (this.run) {
          this.emit('toast', { text: 'THE BOSS OUTLASTED YOU', bad: true });
          const out = this.finishDungeon(false);
          if (out) this.emit('reward', out);
        } else {
          this.failBoss('THE BOSS GOT AWAY');
        }
      }
    }

    hero.anim.update(dt);
    this.enemy?.anim.update(dt);
    state.hp = hero.hp;
  }

  updateDeadHero(dt) {
    this.working = null;   // no swinging from the floor
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;
    // A dungeon is the one place dying costs the attempt: the key is what
    // you wagered, and without that a key would just be a slow guarantee.
    if (this.run) { this.finishDungeon(false); return; }
    this.hero.dead = false;
    this.hero.hp = this.hero.maxHp;
    this.hero.anim.play('idle', { fps: 8 });
    // Falling to the boss costs the attempt: it comes back at full health.
    // Against mobs and mini bosses you only lose the time to get up.
    if (this.enemy?.isBoss) this.failBoss('YOU WENT DOWN');
  }

  updateHero(dt) {
    const { state, hero } = this;

    if (this.burnTimer > 0) this.burnTimer -= dt;
    const curse = this.enemy?.trait?.kind === 'curse' ? 1 - this.enemy.trait.power : 1;
    if (hero.hp < hero.maxHp && this.burnTimer <= 0 && !this.run?.bloody) {
      hero.hp = Math.min(hero.maxHp, hero.hp + state.regen * curse * dt);
    }

    const target = this.enemy;
    const inRange = target && !target.dead
      && target.x - hero.x <= HERO.reach + target.def.reach;

    if (!inRange) {
      // A vein under foot stops the walk. Combat outranks it, so this only
      // runs while nothing is close enough to swing at.
      if (!this.updateGathering(dt)) {
        hero.x += state.moveSpeed * dt;
        hero.anim.play('walk', { fps: 11 });
      }
      hero.attackTimer = Math.min(hero.attackTimer, 0.15);
      if (!target) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) this.spawnEnemy();
      }
      return;
    }
    this.working = null;

    // In range: swing at the pace of the attack speed stat. A Dread Aura
    // stretches the period while its owner stands.
    const aura = target.trait?.kind === 'aura' ? 1 + target.trait.power : 1;
    const period = aura / state.attackRate;
    hero.attackTimer -= dt;
    if (hero.attackTimer <= 0) {
      hero.attackTimer = period;
      hero.swung = false;
      hero.anim.playTimed('attack', Math.min(period * 0.9, 0.55), { force: true });
    } else if (hero.anim.name === 'attack' && hero.anim.done) {
      hero.anim.play('idle', { fps: 8 });
    }

    if (hero.anim.name === 'attack' && !hero.swung && hero.anim.progress >= HERO.hit) {
      hero.swung = true;
      this.heroStrike(target);
    }
  }

  heroStrike(target) {
    const { state, hero } = this;
    // Double Strike turns one swing into two; both go through the same
    // rules, so crit, ambush and execute apply to each.
    const swings = 1 + (Math.random() < state.bonus.doubleHit ? 1 : 0);

    for (let i = 0; i < swings; i++) {
      if (target.dead) return;

      const { damage, crit } = state.rollHit();
      let dealt = damage;
      if (!target.struck) {
        target.struck = true;
        dealt *= 1 + state.bonus.ambush;
      }
      if (target.hp / target.maxHp <= 0.3) dealt *= 1 + state.bonus.executeMul;

      if (target.trait) {
        target.hitsTaken += 1;
        // Shield/Iron Wall: every 3rd hit lands at `power` of its value.
        if (target.trait.kind === 'block' && target.hitsTaken % 3 === 0) {
          dealt *= target.trait.power;
        }
      }

      const killed = target.hurt(dealt);
      this.pushFloater(target, dealt, crit ? 'crit' : 'hit');

      if (state.bonus.lifesteal > 0 && !hero.dead && hero.hp < hero.maxHp) {
        hero.hp = Math.min(hero.maxHp, hero.hp + dealt * state.bonus.lifesteal);
      }

      this.emit('hit', { target, damage: dealt, crit });
      if (killed) {
        this.killEnemy(target);
        return;
      }

      // Riposte: every `power`-th hit the boss SURVIVES answers on the
      // spot. It fires after the hit lands, so a killing blow is never
      // countered by a corpse, and a counter that drops the hero ends the
      // swing instead of letting a dead man keep striking.
      const trait = target.trait;
      if (trait?.kind === 'riposte' && target.hitsTaken % trait.power === 0) {
        this.enemyStrike(target);
        if (hero.dead) return;
      }
    }
    if (target.anim.name !== 'attack') target.anim.play('hurt', { fps: 14, loop: false, force: true });
  }

  killEnemy(target) {
    const { state } = this;
    state.stats.kills += 1;
    if (target.isBoss) state.stats.bossKills += 1;
    target.dead = true;
    target.corpseTimer = CORPSE_TIME;
    target.anim.play('death', { fps: 10, loop: false, force: true });
    this.corpses.push(target);
    this.enemy = null;
    this.spawnTimer = LOOT_PAUSE;

    const gold = state.earn(target.gold);
    this.pushFloater(target, gold, 'gold');

    const dust = state.rollDust(target.kind);
    if (dust > 0) {
      state.dust += dust;
      this.pushFloater(target, dust, 'dust');
      this.emit('dust', dust);
    }

    const xpMul = target.isBoss ? LEVELS.bossXp : target.isElite ? LEVELS.eliteXp : 1;
    const levelsUp = state.gainXp(killXp(this.level, xpMul));
    if (levelsUp) this.emit('toast', { text: `LEVEL ${state.level}!` });
    this.emit('kill', { target, gold, levelsUp });

    if (this.run) {
      this.run.cleared += 1;
      this.run.room += 1;
      if (target.isBoss) this.finishDungeon(true);
      return;
    }

    if (target.isBoss || target.isElite) {
      this.emit('toast', { text: target.isBoss ? 'BOSS DOWN!' : 'MINI BOSS DOWN!' });
      this.advance();
      return;
    }

    // Once the mob count is reached the stage pins the counter there: the
    // next one to show up is the final encounter.
    state.kills = Math.min(state.killsPerStage, state.kills + 1);
  }

  updateEnemy(dt) {
    const enemy = this.enemy;
    if (!enemy) return;
    if (enemy.flash > 0) enemy.flash -= dt;

    const { hero } = this;
    const gap = enemy.x - hero.x;
    const inRange = gap <= HERO.reach + enemy.def.reach;

    if (hero.dead || !inRange) {
      if (!hero.dead) enemy.x -= enemy.def.speed * dt;
      enemy.anim.play('walk', { fps: 10 });
      return;
    }

    if (enemy.trait) enemy.fightT += dt;
    let period = enemy.period;
    if (enemy.trait?.kind === 'frenzy') {
      period *= 1 - enemy.trait.power * (1 - enemy.hp / enemy.maxHp);
    }
    enemy.attackTimer -= dt;
    if (enemy.attackTimer <= 0) {
      enemy.attackTimer = period;
      enemy.swung = false;
      enemy.anim.playTimed('attack', 0.65, { force: true });
    } else if (enemy.anim.name === 'attack' && enemy.anim.done) {
      enemy.anim.play('idle', { fps: 8 });
    } else if (enemy.anim.name === 'walk') {
      enemy.anim.play('idle', { fps: 8 });
    }

    if (enemy.anim.name === 'attack' && !enemy.swung && enemy.anim.progress >= enemy.def.hit) {
      enemy.swung = true;
      this.enemyStrike(enemy);
    }
  }

  enemyStrike(enemy) {
    const { hero } = this;
    if (hero.dead) return;
    let power = 1;
    const trait = enemy.trait;
    if (trait) {
      if (trait.kind === 'enrage' && enemy.hp / enemy.maxHp <= 0.3) power += trait.power;
      if (trait.kind === 'executioner' && hero.hp / hero.maxHp < 0.5) power += trait.power;
      if (trait.kind === 'ramp') power += trait.power * enemy.fightT;
      // Rider & Mount: every `power`-th swing lands twice.
      if (trait.kind === 'doublehit') {
        enemy.swings += 1;
        if (enemy.swings % trait.power === 0) power *= 2;
      }
      // Scorch: the hit snuffs regen for a few seconds.
      if (trait.kind === 'burn') this.burnTimer = trait.power;
    }
    const taken = enemy.damage * power * this.state.damageTaken;
    const killed = hero.hurt(taken);
    this.pushFloater(hero, taken, 'player');
    if (trait?.kind === 'leech' && !enemy.dead) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + taken * trait.power);
    }
    if (killed) {
      this.state.stats.deaths += 1;
      hero.dead = true;
      hero.anim.play('death', { fps: 8, loop: false, force: true });
      this.respawnTimer = RESPAWN_DELAY * this.state.respawnMul;
      this.emit('toast', { text: 'YOU WENT DOWN', bad: true });
    } else if (hero.anim.name !== 'attack') {
      hero.anim.play('hurt', { fps: 14, loop: false, force: true });
    }
  }

  updateCorpses(dt) {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.anim.update(dt);
      c.corpseTimer -= dt;
      if (c.corpseTimer <= 0 || c.x < this.camX - 40) this.corpses.splice(i, 1);
    }
  }

  // --- floating numbers -----------------------------------------------
  /** Top of an actor, in world px above the ground. */
  static topOf(actor) {
    const top = actor.sprite?.top ?? 38;
    return (GROUND_LINE - top) * (actor.scale ?? 1) + (actor.hover ?? 0);
  }

  /** The number comes off the head of whoever got hit rather than a fixed
   *  height, otherwise it cuts through the mini boss health bar. */
  pushFloater(actor, value, kind) {
    this.floaters.push({
      x: actor.x + (Math.random() * 10 - 5),
      base: Battle.topOf(actor) + 8,
      y: 0,
      life: 0,
      value,
      kind,
    });
    if (this.floaters.length > 28) this.floaters.shift();
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life += dt;
      f.y -= 13 * dt;
      if (f.life > 0.9) this.floaters.splice(i, 1);
    }
  }

  /**
   * Stage progress, 0 to 1: mobs fill the first 80% and the final encounter
   * is worth the remaining 20%, by the health it has already lost.
   */
  get stageProgress() {
    if (this.run) {
      const rooms = (this.run.cleared / DUNGEON.rooms) * 0.85;
      const boss = this.enemy?.isBoss ? (1 - this.enemy.hp / this.enemy.maxHp) * 0.15 : 0;
      return Math.min(1, rooms + boss);
    }
    const mobs = Math.min(1, this.state.kills / this.state.killsPerStage) * 0.8;
    const final = this.enemy && (this.enemy.isBoss || this.enemy.isElite)
      ? (1 - this.enemy.hp / this.enemy.maxHp) * 0.2
      : 0;
    return mobs + final;
  }
}
