import { Animator } from '../engine/anim.js';
import { SPRITES, GROUND_LINE } from '../data/sprites.js';
import {
  HERO, MOBS, mobsForStage, eliteForStage, isBossStage, bossForStage, TRAIT_FROM,
  CHAMPIONS, CHAMPION_CHANCE,
} from '../data/enemies.js';
import { LEVELS, killXp } from '../data/levels.js';
import { ENEMY, BOSS_TIME, enemyHp, enemyDamage, enemyGold } from '../data/balance.js';
import {
  SKILLS, GATHER_IDS, GATHER, ALCH, rollResource, nodeYield, workTime, bestForStage,
} from '../data/gathering.js';
import { DISHES } from '../data/dishes.js';
import { PLANET_BY_ID, CONSTELLATION_BY_ID, COSMOS } from '../data/cosmos.js';
import { DUNGEON, dungeonReward } from '../data/dungeon.js';
import { RARITIES } from '../data/gear.js';
import { PETS } from '../data/pets.js';
import { POTIONS } from '../data/potions.js';
import { FEATS, featDone } from '../data/feats.js';

// World units between the hero and where the next enemy appears. Measured
// off the portrait camera this game was balanced on: 130 units of view with
// the hero 30% in leaves 91 in front of him.
const WALK_IN = 91;

const SPAWN_MARGIN = 12;   // world px past the right edge of the screen
const RESPAWN_DELAY = 2.2; // seconds down after dying
const CORPSE_TIME = 1.1;   // how long a corpse stays on screen
const LOOT_PAUSE = 0.35;   // breather between one enemy and the next
const NODE_REACH = 5;      // world px either side of a node the hero can work

// Seconds a held boss waits before walking back in on its own. The hold
// exists so a wall is not an unwatchable death loop -- but for the player
// who closed the game on a held boss it became a different wall: the run
// farmed the same stage forever, because nobody was there to press the
// button. Retrying is free (the hero heals to full either way), so the only
// thing the timer costs an idle run is the retry cadence.
const BOSS_RETRY = 60;

// The sprint window: the first 30 minutes of game time after any reset.
const SPRINT_WINDOW = 1800;

// Freed caravan: how many kills pay double gold and double XP.
const RUSH_KILLS = 5;

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
    // `heroAnchor` is derived now -- see the getter below.

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
    this.retryTimer = 0;  // seconds a held boss has been waiting
    this.overflow = 0;    // Overkill: excess damage owed to the next enemy
    this.rush = 0;        // freed-caravan kills still paying double

    // Gathering nodes live on the same line as everything else. `nextNodeX`
    // walks forward with the hero so a node is placed once and never twice.
    // Only the equipped skill's nodes spawn, which is the tradeoff: time on
    // ore is time not on wood.
    this.nodes = [];
    this.nextNodeX = this.hero.x + GATHER.spacing;
    // Roadside props: a chest or a shrine some stages, picked up by walking
    // over them. Rolled on genuine stage entry only, never on reload.
    this.props = [];
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
   * Where the hero sits on screen, 0..1 -- and therefore how far off the
   * right edge the next enemy spawns.
   *
   * This used to be a flat 0.3, which made the walk-in a fixed SHARE of the
   * view instead of a fixed distance. It was invisible while every screen
   * showed about 130 units of road. The moment the arena became a wide band
   * on a tablet it showed 393, the gap tripled, and tablet players earned
   * HALF what a phone did for the same fight: 19 kills in two minutes
   * against 38. A camera setting had quietly become a balance setting.
   *
   * So the gap is pinned in world units and the anchor follows from it. A
   * wide view now shows more of the road BEHIND you -- corpses, the pets,
   * the scenery you came through -- instead of more empty ground to cross.
   */
  get heroAnchor() {
    const anchor = 1 - WALK_IN / this.viewWidth;
    return Math.max(0.3, Math.min(0.78, anchor));
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
    this.overflow = 0;
    this.props.length = 0;
    // The road sometimes has something on it. keepKills marks a reload, and
    // a reload must not re-roll the dice: that is a slot machine with F5.
    if (!keepKills && !this.run) {
      const roll = Math.random();
      const at = this.hero.x + 60 + Math.random() * 140;
      if (roll < 0.12) {
        this.props.push({ kind: 'chest', x: at });
      } else if (roll < 0.20) {
        this.props.push({ kind: 'shrine', x: at });
      } else if (roll < 0.25) {
        this.props.push({ kind: 'merchant', x: at });
      } else if (roll < 0.30) {
        this.props.push({ kind: 'caravan', x: at });
      }
    }
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
    // The sprint: deepest stage inside the first half hour of a run. A
    // record with no server behind it, kept because "how fast does my build
    // open" is the one question each rebirth actually answers.
    if (this.state.runClock <= SPRINT_WINDOW && next > this.state.sprintBest) {
      this.state.sprintBest = next;
    }
    this.enterStage(next);
  }

  /** Walking over a prop opens it. The hero only ever moves forward. */
  updateProps() {
    const { state, hero } = this;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i];
      if (hero.x < prop.x - 2) continue;
      this.props.splice(i, 1);
      if (prop.kind === 'chest') {
        // Ten mobs' worth of gold, scaled to the stage under your feet.
        const gold = state.earn(enemyGold(this.level, 1) * 10 * (1 + Math.random() * 0.5));
        this.pushFloater({ x: prop.x, sprite: null, scale: 1 }, gold, 'gold');
        if (state.forgeUnlocked && Math.random() < 0.35) {
          const dust = Math.max(1, Math.round(3 * state.bonus.dustMul));
          state.dust += dust;
          this.pushFloater({ x: prop.x, sprite: null, scale: 1 }, dust, 'dust');
          this.emit('dust', dust);
        }
        this.emit('chest', prop);
      } else if (prop.kind === 'merchant') {
        // A wanderer with a hand cart. After the forge exists he reforges
        // your weakest slot on the house -- same rules as the forge, so a
        // bad roll pays a pinch of dust instead of a downgrade. Before the
        // forge, he pays gold: a merchant with nothing to fit you still buys.
        const slotId = state.weakestSlot();
        if (slotId) {
          const out = state.freeForge(slotId);
          if (out.equipped) {
            this.emit('toast', { text: `MERCHANT: ${RARITIES[out.rolled].name.toUpperCase()} ${slotId.toUpperCase()}` });
          } else {
            const dust = Math.max(3, Math.round(6 * state.bonus.dustMul));
            state.dust += dust;
            this.pushFloater({ x: prop.x, sprite: null, scale: 1 }, dust, 'dust');
            this.emit('toast', { text: `MERCHANT: +${dust} DUST` });
            this.emit('dust', dust);
          }
        } else {
          const gold = state.earn(enemyGold(this.level, 1) * 5);
          this.pushFloater({ x: prop.x, sprite: null, scale: 1 }, gold, 'gold');
          this.emit('toast', { text: 'MERCHANT: A FAIR PRICE' });
        }
        this.emit('chest', prop);   // same jingle: something good on the road
      } else if (prop.kind === 'caravan') {
        // An ambushed caravan, freed in passing: the grateful next few
        // fights pay double gold and double experience.
        this.rush = RUSH_KILLS;
        this.emit('toast', { text: `CARAVAN FREED: ${RUSH_KILLS} KILLS PAY DOUBLE` });
        this.emit('chest', prop);
      } else {
        // A shrine pours a free minute and a half of one of the cauldron's
        // brews: a taste of the bench for whoever has not found it yet.
        // Shrinewise stretches the pour, and every shrine teaches the
        // cauldron a little -- the idle trickle a brew-only skill lacks.
        const potion = POTIONS[(Math.random() * POTIONS.length) | 0];
        const pour = Math.round(90 * (1 + state.gatherBonus('alchemy').shrinePower));
        state.potions[potion.id] = Math.max(state.potions[potion.id] ?? 0, pour);
        state.gainGatherXp('alchemy', ALCH.shrineXp);
        this.emit('toast', { text: `SHRINE: ${potion.name.toUpperCase()}, ${pour}S` });
        this.emit('shrine', prop);
      }
    }
  }

  /** Rebuilds the parade when the tamed set changes. */
  syncPets() {
    const tamed = PETS.filter((p) => this.state.pets[p.id]);
    const key = tamed.map((p) => p.id).join(',');
    if (key === this._petKey) return;
    this._petKey = key;
    // The parade tightens as it grows. At nine units apart ten pets trail 95
    // behind the hero, and the road behind him is 35 units on a phone and 75
    // in a desktop column -- so the last of them would be tamed, fed and
    // permanently off screen. Closing up overlaps them slightly, which reads
    // as a crowd rather than a queue.
    this.petStep = Math.max(6, 9 - Math.max(0, tamed.length - 5) * 0.6);
    this.petActors = tamed.map((pet, i) => {
      // The sprite is a roster mob; hover comes from its own def so the bat
      // pet flies exactly as high as the bat it used to be.
      const mob = MOBS.find((m) => m.id === pet.sprite);
      const def = { id: pet.sprite, petId: pet.id, hover: mob?.hover ?? 0, reach: 0, speed: 0, hit: 0 };
      const actor = new Actor(def, this.sheets[pet.sprite], {
        x: this.hero.x - 13 - i * this.petStep, facing: 1,
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
    // Tames and feats complete off slow counters; polling them sixty times
    // a second was a tenth of the whole simulation (each pass rebuilds the
    // parade key and runs ten unlock closures). Once a second of game time
    // catches every crossing the same frame a human could notice it.
    this._tameTimer = (this._tameTimer ?? 1) + dt;
    if (this._tameTimer >= 1) {
      this._tameTimer = 0;
      for (const pet of this.state.tamePets()) {
        this.emit('toast', { text: `${pet.name.toUpperCase()} TAMED!` });
      }
      for (const feat of FEATS) {
        if (this._featsDone.has(feat.id) || !featDone(feat, this.state.stats)) continue;
        this._featsDone.add(feat.id);
        this.state.invalidateBonus();
        this.emit('toast', { text: `FEAT: ${feat.name.toUpperCase()}` });
      }
      this.syncPets();
    }
    const walking = this.hero.anim.name === 'walk';
    for (let i = 0; i < this.petActors.length; i++) {
      const actor = this.petActors[i];
      actor.x = this.hero.x - 13 - i * this.petStep;
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
    this.retryTimer = 0;
    this.emit('toast', { text: reason, bad: true });
    this.emit('bossHeld', true);
  }

  /** The button. Sends the boss back in; a held minute presses it unasked. */
  tryBoss() {
    if (!this.state.bossHeld) return false;
    this.state.bossHeld = false;
    this.retryTimer = 0;
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
    // Read BEFORE deepestKey moves below, or the bounty for going deeper than
    // ever can never be true: the line that records the clear is the same
    // line that would make this false.
    const first = won && key.tier > (this.state.deepestKey ?? -1);
    const reward = dungeonReward(key, cleared, won, first);
    // The double is the prize for FINISHING under the moon. Doubling the
    // partial share too made leave-at-room-seven pay 1.75x a normal full
    // clear with the boss fight skipped: a bet that could not lose.
    if (bloody && won) {
      reward.relics *= 2;
      reward.gems *= 2;
      reward.dust *= 2;
      reward.goldMul *= 2;
    }
    this.state.relics += reward.relics;
    this.state.gems += reward.gems;
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
    // Every way out of a run comes through here, so this is the one place the
    // payout can be announced from. It follows the toast above deliberately:
    // a run that cleared nothing has no numbers to show and leaves the plain
    // line standing, and a run that has them replaces it with the better one.
    const out = { ...reward, gold, won, cleared, first };
    this.emit('reward', out);
    return out;
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

    // Overkill: the excess of the last killing blow lands on whoever walks
    // in next, floored so a carry can never kill on its own -- the shop
    // shelf buys pace on the trash line, not a cascade.
    if (this.overflow > 0) {
      const hit = Math.min(this.overflow, actor.maxHp - 1);
      actor.hp -= hit;
      this.overflow = 0;
      this.pushFloater(actor, hit, 'hit');
    }

    // One mob in ~40 walks in as a champion: louder colour, its own prize.
    if (kind === 'mob' && Math.random() < CHAMPION_CHANCE) {
      const pool = CHAMPIONS.filter((c) => !c.needsForge || this.state.forgeUnlocked);
      const champ = pool[(Math.random() * pool.length) | 0];
      actor.champion = champ;
      actor.maxHp *= champ.hp;
      actor.hp = actor.maxHp;
      if (champ.gold) actor.gold *= champ.gold;
      this.pushFloater(actor, champ.name, 'champ', champ.color);
    }

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
    // The Harvest Stew multiplies at the harvest site because the per-skill
    // bonus fold is cached and a ten-minute dish must not invalidate it.
    const amount = Math.max(1, Math.round(
      nodeYield(node.resource, state.tools[skillId], bonus) * double * state.dishMul('stew')));
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

  /**
   * The Cosmos. Observation runs on game time (the speed toggle turns the
   * sky faster), and every discovered planet does one thing a finger was
   * doing. Gathering planets pay one full node per tick on their line --
   * roughly a third of working it by hand -- and skip the line your tool is
   * on, which is already gathering for real. Bench planets only re-run a
   * brew, dish or claim that the player set going themselves.
   */
  updateCosmos(dt) {
    const { state } = this;
    if (!state.cosmosOpen) return;
    const found = state.tickCosmos(dt);
    if (found) {
      this.emit('toast', { text: CONSTELLATION_BY_ID[found.id]
        ? `${found.name.toUpperCase()} CHARTED!`
        : `${found.name.toUpperCase()} DISCOVERED!` });
    }
    if (!state.cosmos.found.length) return;

    this.cosmosTimer = (this.cosmosTimer ?? 0) + dt;
    if (this.cosmosTimer < COSMOS.every) return;
    this.cosmosTimer = 0;

    for (const pid of state.cosmos.found) {
      const planet = PLANET_BY_ID[pid];
      // Constellations sit in the same found list; their work is passive
      // (they fold into the bonuses), so the automation loop skips them.
      if (!planet) continue;
      if (planet.auto === 'skill') {
        const skill = planet.skill;
        if (state.tool === skill) continue;
        // Best resource both the stage and the tool can reach; no tease
        // roll here -- a planet never taunts you with what it cannot work.
        const list = SKILLS[skill].resources;
        const best = bestForStage(skill, this.level);
        const resource = best.tier <= state.tools[skill] ? best
          : (list.filter((r) => this.level >= r.minStage && r.tier <= state.tools[skill]).at(-1) ?? list[0]);
        const amount = nodeYield(resource, state.tools[skill], state.gatherBonus(skill));
        state.addRaw(resource.id, amount);
        const levels = state.gainGatherXp(skill, resource.xp * COSMOS.xpShare);
        if (levels) {
          this.emit('toast', { text: `${SKILLS[skill].name.toUpperCase()} ${state.skills[skill].level}!` });
        }
      } else if (planet.auto === 'brews') {
        for (const potion of POTIONS) {
          const left = state.potions[potion.id] ?? 0;
          if (left > 0 && left < COSMOS.topUpBelow && state.canBrew(potion.id)) {
            state.brew(potion.id);
          }
        }
      } else if (planet.auto === 'dishes') {
        for (const dish of DISHES) {
          const left = state.dishes[dish.id] ?? 0;
          if (left > 0 && left < COSMOS.topUpBelow && state.canCook(dish.id)) {
            state.cook(dish.id);
          }
        }
      } else if (planet.auto === 'contracts') {
        const { dailies, weekly } = state.questBoard();
        let paid = 0;
        for (const quest of dailies) {
          if (state.canClaimQuest(quest)) paid += state.claimQuest(quest);
        }
        if (state.canClaimQuest(weekly, true)) paid += state.claimQuest(weekly, true);
        if (paid) this.emit('toast', { text: `MERCURY: +${paid} GEM(S)` });
      } else if (planet.auto === 'refine') {
        for (const gid of GATHER_IDS) {
          for (const resource of SKILLS[gid].resources) state.refine(gid, resource);
        }
      }
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

    state.runClock += dt;   // the sprint clock counts game time, like clock
    hero.maxHp = state.maxHp;
    hero.hp = Math.min(hero.hp, hero.maxHp);
    if (hero.flash > 0) hero.flash -= dt;

    if (hero.dead) this.updateDeadHero(dt);
    else this.updateHero(dt);

    this.updateNodes(dt);
    this.updateAutoSwitch(dt);
    state.tickMeals(dt);
    state.tickPotions(dt);
    state.tickDishes(dt);

    this.updateEnemy(dt);
    this.updateProps();
    this.updatePets(dt);
    this.updateCosmos(dt);
    this.updateCorpses(dt);
    this.updateFloaters(dt);

    // A held boss retries itself once a minute. The manual button still
    // works and still says AGAIN; this is only the finger of whoever is not
    // in the room, so an idle night stops parking on one failed fight.
    if (state.bossHeld && !this.run && !hero.dead) {
      this.retryTimer += dt;
      if (this.retryTimer >= BOSS_RETRY) this.tryBoss();
    }

    if (this.enemy?.isBoss && !hero.dead) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        // On the line the boss gets away and waits behind the button. In a
        // dungeon the key IS the wager: failBoss here healed the hero to
        // full and respawned the boss on a fresh clock forever, which made
        // the timer free and voided the Bloodmoon's entire stake.
        if (this.run) {
          this.emit('toast', { text: 'THE BOSS OUTLASTED YOU', bad: true });
          this.finishDungeon(false);
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
    const swings = 1 + (Math.random() < state.doubleHit ? 1 : 0);

    for (let i = 0; i < swings; i++) {
      if (target.dead) return;

      const { damage, crit } = state.rollHit();
      let dealt = damage;
      if (!target.struck) {
        target.struck = true;
        dealt *= 1 + state.bonus.ambush;
      }
      if (target.hp / target.maxHp <= 0.3) dealt *= 1 + state.bonus.executeMul;
      if (target.isBoss || target.isElite) dealt *= 1 + state.bossDamage;

      if (target.trait) {
        target.hitsTaken += 1;
        // Shield/Iron Wall: every 3rd hit lands at `power` of its value.
        if (target.trait.kind === 'block' && target.hitsTaken % 3 === 0) {
          dealt *= target.trait.power;
        }
      }

      const before = target.hp;
      const killed = target.hurt(dealt);
      this.pushFloater(target, dealt, crit ? 'crit' : 'hit');

      if (state.lifesteal > 0 && !hero.dead && hero.hp < hero.maxHp) {
        hero.hp = Math.min(hero.maxHp, hero.hp + dealt * state.lifesteal);
      }

      this.emit('hit', { target, damage: dealt, crit });
      if (killed) {
        if (state.overkill > 0 && dealt > before) {
          this.overflow += (dealt - before) * state.overkill;
        }
        this.killEnemy(target);
        return;
      }

      // Reap: whatever survives the swing below the threshold dies anyway.
      // Bosses are exempt -- their timer is the fight, and a shelf upgrade
      // must not shave it -- but dungeon rooms and mini bosses are fair game.
      if (state.reap > 0 && !target.isBoss && target.hp <= target.maxHp * state.reap) {
        this.pushFloater(target, target.hp, 'hit');
        target.hurt(target.hp);
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
    state.streak += 1;   // Frenzy; reset wherever the hero goes down
    if (target.isBoss) state.stats.bossKills += 1;
    target.dead = true;
    target.corpseTimer = CORPSE_TIME;
    target.anim.play('death', { fps: 10, loop: false, force: true });
    this.corpses.push(target);
    this.enemy = null;
    this.spawnTimer = LOOT_PAUSE;

    // Treasure doubles the drop, not the rate: it goes through earn() like
    // any other coin, so the offline payout and every gold multiplier see it
    // exactly as they see a good stage.
    const lucky = state.bonus.treasure > 0 && Math.random() < state.bonus.treasure;
    // War Chest tops up the two encounter kinds that pay flat multiples, so
    // it scales the stage's PUNCTUATION rather than the whole income line.
    const spoils = target.isBoss || target.isElite ? 1 + state.warChest : 1;
    // The freed caravan's thanks: a burst, not a buff, so it cannot stack.
    const rush = this.rush > 0 ? 2 : 1;
    if (this.rush > 0) this.rush -= 1;
    const gold = state.earn(target.gold * (lucky ? 2 : 1) * spoils * rush);
    this.pushFloater(target, gold, 'gold');

    let dust = state.rollDust(target.kind);
    if (target.champion?.dust) {
      dust += Math.max(1, Math.round(target.champion.dust * state.bonus.dustMul));
    }
    if (dust > 0) {
      state.dust += dust;
      this.pushFloater(target, dust, 'dust');
      this.emit('dust', dust);
    }

    const xpMul = target.isBoss ? LEVELS.bossXp
      : target.isElite ? LEVELS.eliteXp
      : (target.champion?.xp ?? 1);
    const levelsUp = state.gainXp(killXp(this.level, xpMul) * rush);
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
      if (!hero.dead) enemy.x -= enemy.def.speed * (enemy.champion?.speed ?? 1) * dt;
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
    let killed = hero.hurt(taken);
    // Phoenix Heart: the blow that would have landed you on the floor
    // sometimes leaves you at a third instead. Checked before anything
    // reads `killed`, so the streak, the death counter and the boss hold
    // all see a hit that simply hurt.
    if (killed && Math.random() < this.state.phoenix) {
      killed = false;
      hero.hp = hero.maxHp * 0.3;
      this.emit('toast', { text: 'PHOENIX HEART' });
    }
    this.emit('heroHurt', { killed });
    this.pushFloater(hero, taken, 'player');
    if (trait?.kind === 'leech' && !enemy.dead) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + taken * trait.power);
    }
    // Thorns. Off the damage that actually landed, so armour and Carapace
    // cut what comes back as well as what goes in -- the alternative pays
    // the tankiest build the most for being hit hardest, which is backwards.
    const thorns = this.state.thorns;
    if (thorns > 0 && !enemy.dead && taken > 0) {
      const back = taken * thorns;
      if (enemy.hurt(back)) { this.pushFloater(enemy, back, 'hit'); this.killEnemy(enemy); }
      else this.pushFloater(enemy, back, 'hit');
    }
    if (killed) {
      this.state.stats.deaths += 1;
      // Frenzy ends where the run ends. It counts a clean streak, and a
      // death is the definition of that streak being over.
      this.state.streak = 0;
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
  pushFloater(actor, value, kind, color = null) {
    this.floaters.push({
      x: actor.x + (Math.random() * 10 - 5),
      base: Battle.topOf(actor) + 8,
      y: 0,
      life: 0,
      value,
      kind,
      color,
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
