import { Animator } from '../engine/anim.js';
import { SPRITES, GROUND_LINE } from '../data/sprites.js';
import {
  HERO, mobsForStage, eliteForStage, isBossStage, bossForStage,
} from '../data/enemies.js';
import { LEVELS, killXp } from '../data/levels.js';
import { ENEMY, BOSS_TIME, enemyHp, enemyDamage, enemyGold } from '../data/balance.js';

const SPAWN_MARGIN = 12;   // world px past the right edge of the screen
const RESPAWN_DELAY = 2.2; // seconds down after dying
const CORPSE_TIME = 1.1;   // how long a corpse stays on screen
const LOOT_PAUSE = 0.35;   // breather between one enemy and the next

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
  get isBoss() {
    return isBossStage(this.state.stage);
  }

  get camX() {
    return this.hero.x - this.viewWidth * this.heroAnchor;
  }

  /**
   * Every stage ends on a final encounter: a mini boss on regular stages,
   * a real boss (with a timer) every 5.
   */
  get atFinalEncounter() {
    return this.state.kills >= this.state.killsPerStage;
  }

  enterStage(stage, { silent = false, keepKills = false } = {}) {
    this.state.stage = Math.max(1, stage);
    if (!keepKills) this.state.kills = 0;
    this.enemy = null;
    this.corpses.length = 0;
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

  goToStage(stage) {
    const clamped = Math.min(Math.max(1, stage), this.state.maxStage);
    if (clamped === this.state.stage) return;
    this.enterStage(clamped);
  }

  failBoss(reason) {
    this.enemy = null;
    this.bossTimer = 0;
    this.state.hp = this.hero.hp = this.hero.maxHp;
    this.spawnTimer = 1.2;
    this.emit('toast', { text: reason, bad: true });
  }

  // --- spawning -----------------------------------------------------
  /** Which enemy comes next: `'mob'`, `'elite'` or `'boss'`. */
  nextEncounter() {
    if (!this.atFinalEncounter) return 'mob';
    return this.isBoss ? 'boss' : 'elite';
  }

  spawnEnemy() {
    const { stage } = this.state;
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
    actor.maxHp = enemyHp(stage, stats.hp);
    actor.hp = actor.maxHp;
    actor.damage = enemyDamage(stage, stats.dmg);
    actor.gold = enemyGold(stage, stats.gold);
    actor.period = stats.period;
    actor.attackTimer = actor.period * 0.6;

    this.enemy = actor;
    // The boss timer only starts running once it walks on screen.
    if (actor.isBoss) this.bossTimer = BOSS_TIME + this.state.bonus.bossTime;
    if (actor.isElite) this.emit('toast', { text: `MINI BOSS: ${def.name}` });
    if (actor.isBoss) this.emit('toast', { text: `BOSS: ${def.name}`, bad: true });
    this.emit('spawn', actor);
  }

  // --- loop ---------------------------------------------------------
  update(dt) {
    const { state, hero } = this;

    hero.maxHp = state.maxHp;
    hero.hp = Math.min(hero.hp, hero.maxHp);
    if (hero.flash > 0) hero.flash -= dt;

    if (hero.dead) this.updateDeadHero(dt);
    else this.updateHero(dt);

    this.updateEnemy(dt);
    this.updateCorpses(dt);
    this.updateFloaters(dt);

    if (this.enemy?.isBoss && !hero.dead) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) this.failBoss('THE BOSS GOT AWAY');
    }

    hero.anim.update(dt);
    this.enemy?.anim.update(dt);
    state.hp = hero.hp;
  }

  updateDeadHero(dt) {
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;
    this.hero.dead = false;
    this.hero.hp = this.hero.maxHp;
    this.hero.anim.play('idle', { fps: 8 });
    // Falling to the boss costs the attempt: it comes back at full health.
    // Against mobs and mini bosses you only lose the time to get up.
    if (this.enemy?.isBoss) this.failBoss('YOU WENT DOWN');
  }

  updateHero(dt) {
    const { state, hero } = this;

    if (hero.hp < hero.maxHp) hero.hp = Math.min(hero.maxHp, hero.hp + state.regen * dt);

    const target = this.enemy;
    const inRange = target && !target.dead
      && target.x - hero.x <= HERO.reach + target.def.reach;

    if (!inRange) {
      hero.x += state.moveSpeed * dt;
      hero.anim.play('walk', { fps: 11 });
      hero.attackTimer = Math.min(hero.attackTimer, 0.15);
      if (!target) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) this.spawnEnemy();
      }
      return;
    }

    // In range: swing at the pace of the attack speed stat.
    const period = 1 / state.attackRate;
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
    }
    if (target.anim.name !== 'attack') target.anim.play('hurt', { fps: 14, loop: false, force: true });
  }

  killEnemy(target) {
    const { state } = this;
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
    const levelsUp = state.gainXp(killXp(state.stage, xpMul));
    if (levelsUp) this.emit('toast', { text: `LEVEL ${state.level}!` });
    this.emit('kill', { target, gold, levelsUp });

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

    enemy.attackTimer -= dt;
    if (enemy.attackTimer <= 0) {
      enemy.attackTimer = enemy.period;
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
    const taken = enemy.damage * this.state.damageTaken;
    const killed = hero.hurt(taken);
    this.pushFloater(hero, taken, 'player');
    if (killed) {
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
    const mobs = Math.min(1, this.state.kills / this.state.killsPerStage) * 0.8;
    const final = this.enemy && (this.enemy.isBoss || this.enemy.isElite)
      ? (1 - this.enemy.hp / this.enemy.maxHp) * 0.2
      : 0;
    return mobs + final;
  }
}
