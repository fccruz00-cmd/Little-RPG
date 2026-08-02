import { Animator } from '../engine/anim.js';
import { SPRITES } from '../data/sprites.js';
import {
  HERO, KILLS_PER_STAGE, mobsForStage, isBossStage, bossForStage,
} from '../data/enemies.js';
import { ENEMY, BOSS_TIME, enemyHp, enemyDamage, enemyGold } from '../data/balance.js';

const SPAWN_MARGIN = 12;   // px do mundo além da borda direita da tela
const RESPAWN_DELAY = 2.2; // segundos parado depois de morrer
const CORPSE_TIME = 1.1;   // quanto tempo o cadáver fica na tela
const LOOT_PAUSE = 0.35;   // respiro entre um inimigo e o próximo

let nextId = 1;

/** Um ator na arena: herói, inimigo ou cadáver. */
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
 * Simulação da arena. Não sabe nada de canvas nem de DOM: só avança o
 * mundo e emite eventos que a renderização e a UI consomem.
 */
export class Battle {
  /**
   * @param {import('./state.js').GameState} state
   * @param {Record<string, any>} actorSheets sprites já carregados
   */
  constructor(state, actorSheets) {
    this.state = state;
    this.sheets = actorSheets;
    this.listeners = {};

    this.viewWidth = 200;           // largura lógica da arena, ajustada no resize
    this.heroAnchor = 0.3;          // onde o herói fica preso na tela (0..1)

    this.hero = new Actor(HERO, actorSheets[HERO.id], { x: 0, facing: 1 });
    this.hero.maxHp = state.maxHp;
    this.hero.hp = state.hp ?? state.maxHp;

    this.enemy = null;
    this.corpses = [];
    this.floaters = [];
    this.respawnTimer = 0;
    this.spawnTimer = 0;
    this.bossTimer = 0;

    this.enterStage(state.stage, { silent: true });
  }

  // ── eventos ───────────────────────────────────────────────────────
  on(name, fn) {
    (this.listeners[name] ??= []).push(fn);
    return this;
  }

  emit(name, payload) {
    for (const fn of this.listeners[name] ?? []) fn(payload);
  }

  // ── fases ─────────────────────────────────────────────────────────
  get isBoss() {
    return isBossStage(this.state.stage);
  }

  get camX() {
    return this.hero.x - this.viewWidth * this.heroAnchor;
  }

  enterStage(stage, { silent = false } = {}) {
    this.state.stage = Math.max(1, stage);
    this.state.kills = 0;
    this.enemy = null;
    this.corpses.length = 0;
    this.spawnTimer = 0.4;
    this.bossTimer = this.isBoss ? BOSS_TIME : 0;
    this.emit('stage', this.state.stage);
    if (!silent) {
      this.emit('toast', this.isBoss
        ? { text: `CHEFE — FASE ${this.state.stage}`, bad: true }
        : { text: `FASE ${this.state.stage}` });
    }
  }

  advance() {
    const next = this.state.stage + 1;
    this.state.maxStage = Math.max(this.state.maxStage, next);
    this.enterStage(next);
  }

  goToStage(stage) {
    const clamped = Math.min(Math.max(1, stage), this.state.maxStage);
    if (clamped === this.state.stage) return;
    this.enterStage(clamped);
  }

  failBoss(reason) {
    this.enemy = null;
    this.bossTimer = BOSS_TIME;
    this.spawnTimer = 1.2;
    this.emit('toast', { text: reason, bad: true });
  }

  // ── spawn ─────────────────────────────────────────────────────────
  spawnEnemy() {
    const { stage } = this.state;
    const boss = this.isBoss;
    const pool = mobsForStage(stage);
    const def = boss ? bossForStage(stage) : pool[(Math.random() * pool.length) | 0];

    const actor = new Actor(def, this.sheets[def.id], {
      x: this.camX + this.viewWidth + SPAWN_MARGIN,
      facing: -1,
    });
    actor.maxHp = enemyHp(stage, def.hp * (boss ? ENEMY.bossHp : 1));
    actor.hp = actor.maxHp;
    actor.damage = enemyDamage(stage, def.dmg);
    actor.gold = enemyGold(stage, boss ? ENEMY.bossGold : 1);
    actor.period = boss ? ENEMY.bossAttackPeriod : ENEMY.attackPeriod;
    actor.attackTimer = actor.period * 0.6;
    actor.isBoss = boss;
    this.enemy = actor;
    this.emit('spawn', actor);
  }

  // ── loop ──────────────────────────────────────────────────────────
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

    if (this.isBoss && this.enemy && !hero.dead) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) this.failBoss('O CHEFE FUGIU');
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
    if (this.isBoss) this.failBoss('VOCÊ CAIU');
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

    // Em alcance: ataca no ritmo do atributo de velocidade de ataque.
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
    const { damage, crit } = this.state.rollHit();
    const killed = target.hurt(damage);
    this.pushFloater(target.x, damage, crit ? 'crit' : 'hit');
    this.emit('hit', { target, damage, crit });
    if (killed) this.killEnemy(target);
    else if (target.anim.name !== 'attack') target.anim.play('hurt', { fps: 14, loop: false, force: true });
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
    this.pushFloater(target.x, gold, 'gold');
    this.emit('kill', { target, gold });

    if (target.isBoss) {
      this.emit('toast', { text: 'CHEFE DERROTADO!' });
      this.advance();
      return;
    }

    state.kills += 1;
    if (state.kills >= KILLS_PER_STAGE) this.advance();
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
    const killed = hero.hurt(enemy.damage);
    this.pushFloater(hero.x, enemy.damage, 'player');
    if (killed) {
      hero.dead = true;
      hero.anim.play('death', { fps: 8, loop: false, force: true });
      this.respawnTimer = RESPAWN_DELAY;
      this.emit('toast', { text: 'VOCÊ CAIU', bad: true });
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

  // ── números flutuantes ────────────────────────────────────────────
  pushFloater(x, value, kind) {
    this.floaters.push({ x: x + (Math.random() * 10 - 5), y: 0, life: 0, value, kind });
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

  /** Progresso da fase, de 0 a 1. */
  get stageProgress() {
    if (this.isBoss) {
      const boss = this.enemy;
      return boss ? 1 - boss.hp / boss.maxHp : 0;
    }
    return this.state.kills / KILLS_PER_STAGE;
  }
}
