import { Animator } from '../engine/anim.js';
import { SPRITES, GROUND_LINE } from '../data/sprites.js';
import {
  HERO, KILLS_PER_STAGE, mobsForStage, eliteForStage, isBossStage, bossForStage,
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

    // Ao carregar o save mantém os abates já feitos: fechar o jogo no meio de
    // uma fase não devolve você pro começo dela.
    this.enterStage(state.stage, { silent: true, keepKills: true });
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

  /**
   * Toda fase termina num encontro final: mini-chefe nas fases comuns,
   * chefe de verdade (com cronômetro) de 5 em 5.
   */
  get atFinalEncounter() {
    return this.state.kills >= KILLS_PER_STAGE;
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
        ? { text: `FASE ${this.state.stage} — CHEFE À FRENTE`, bad: true }
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
    this.bossTimer = 0;
    this.spawnTimer = 1.2;
    this.emit('toast', { text: reason, bad: true });
  }

  // ── spawn ─────────────────────────────────────────────────────────
  /** Que tipo de inimigo vem agora: `'mob'`, `'elite'` ou `'boss'`. */
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

    // O mini-chefe usa multiplicadores fixos em vez dos do próprio bicho:
    // os mobs variam de 0,55× a 2,6× de vida, e herdar isso faria o
    // mini-chefe pular de trivial a mais duro que o chefe conforme a fase.
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
    // O cronômetro do chefe só começa a correr quando ele entra em cena.
    if (actor.isBoss) this.bossTimer = BOSS_TIME;
    if (actor.isElite) this.emit('toast', { text: `MINI-CHEFE: ${def.name}` });
    if (actor.isBoss) this.emit('toast', { text: `CHEFE: ${def.name}`, bad: true });
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

    if (this.enemy?.isBoss && !hero.dead) {
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
    // Cair pro chefe custa a tentativa: ele volta com a vida cheia. Contra
    // mob e mini-chefe você só perde o tempo de levantar.
    if (this.enemy?.isBoss) this.failBoss('VOCÊ CAIU');
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
    this.pushFloater(target, damage, crit ? 'crit' : 'hit');
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
    this.pushFloater(target, gold, 'gold');
    this.emit('kill', { target, gold });

    if (target.isBoss || target.isElite) {
      this.emit('toast', { text: target.isBoss ? 'CHEFE DERROTADO!' : 'MINI-CHEFE DERROTADO!' });
      this.advance();
      return;
    }

    // Bate o número de mobs e a fase segura o contador ali: o próximo a
    // aparecer é o encontro final.
    state.kills = Math.min(KILLS_PER_STAGE, state.kills + 1);
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
    this.pushFloater(hero, enemy.damage, 'player');
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
  /** Altura do topo de um ator, em px do mundo acima do chão. */
  static topOf(actor) {
    const top = actor.sprite?.top ?? 38;
    return (GROUND_LINE - top) * (actor.scale ?? 1) + (actor.hover ?? 0);
  }

  /** O número sai de cima da cabeça de quem levou o golpe, não de uma
   *  altura fixa — senão ele atravessa a barra de vida do mini-chefe. */
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
   * Progresso da fase, de 0 a 1: os mobs enchem os primeiros 80% e o
   * encontro final vale os 20% restantes, pela vida que já levou.
   */
  get stageProgress() {
    const mobs = Math.min(1, this.state.kills / KILLS_PER_STAGE) * 0.8;
    const final = this.enemy && (this.enemy.isBoss || this.enemy.isElite)
      ? (1 - this.enemy.hp / this.enemy.maxHp) * 0.2
      : 0;
    return mobs + final;
  }
}
