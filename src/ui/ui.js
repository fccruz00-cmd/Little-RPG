import { UPGRADES } from '../data/upgrades.js';
import { GameState } from '../game/state.js';
import { TALENT_TREE, RELIC_TREE, describeNode, relicCost } from '../data/talents.js';
import { nextRelicStage, relicsEarnedAt, PRESTIGE } from '../data/prestige.js';
import { AUTO_BUY_BASE } from '../data/talents.js';
import { SLOTS, RARITIES, describeGear, rarityOdds } from '../data/gear.js';
import {
  SKILLS, SKILL_IDS, GATHER_IDS, SKILL_TREES, TOOL_TIERS, toolName, workTime,
  describeGatherNode,
} from '../data/gathering.js';
import { fmt, pct, mult, duration } from '../format.js';

const AUTO_FORGE_EVERY = 1.5;   // seconds between Anvil forges
const AUTOMATION_CATCHUP = 200; // most actions one tickAutomation may replay

/**
 * How to measure an upgrade's payoff, so the best value can be flagged.
 * Surviving and walking are worth less than killing, hence the weights.
 */
const SCORE = {
  damage:     [(s) => s.dps, 1],
  attackRate: [(s) => s.dps, 1],
  critChance: [(s) => s.dps, 1],
  critPower:  [(s) => s.dps, 1],
  maxHp:      [(s) => s.maxHp * (1 + s.regen / 8), 0.45],
  regen:      [(s) => s.maxHp * (1 + s.regen / 8), 0.45],
  goldGain:   [(s) => s.goldGain, 1],
  moveSpeed:  [(s) => s.moveSpeed, 0.35],
};

const $ = (id) => document.getElementById(id);

/** Writes `el.textContent` only when the value actually changed. */
function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

function setHtml(el, value) {
  if (el.innerHTML !== value) el.innerHTML = value;
}

export class UI {
  /**
   * @param {import('../game/state.js').GameState} state
   * @param {import('../game/battle.js').Battle} battle
   */
  constructor(state, battle) {
    this.state = state;
    this.battle = battle;

    this.el = {
      stageName: $('stage-name'), stageSub: $('stage-sub'),
      stagePrev: $('stage-prev'), stageNext: $('stage-next'),
      progress: $('stage-progress'),
      gold: $('stat-gold'), gps: $('stat-gps'), best: $('stat-best'),
      stageFoot: $('stat-stage-foot'), shopHint: $('shop-hint'),
      sbDps: $('sb-dps'), sbHp: $('sb-hp'), sbCrit: $('sb-crit'), sbGold: $('sb-gold'),
      level: $('stat-level'), xpFill: $('xp-fill'), xpText: $('xp-text'),
      bossTimer: $('boss-timer'), bossValue: $('boss-timer-value'),
      toast: $('toast'),
      tabs: $('tabs'),
      shop: $('shop-list'), buyMax: $('buy-max'),
      treeSwitch: $('tree-switch'), treePoints: $('tree-points'), treeDetail: $('tree-detail'),
      respec: $('btn-respec'),
      treeTalents: $('tree-talents'), treeRelics: $('tree-relics'),
      skillSwitch: $('skill-switch'), skillPoints: $('skill-points'),
      skillDetail: $('skill-detail'), respecSkill: $('btn-respec-skill'),
      skillXpFill: $('skill-xp-fill'), skillXpText: $('skill-xp-text'),
      skillEquip: $('skill-equip'), equipIcon: $('equip-icon'), equipLabel: $('equip-label'),
      stock: $('stock'), toolBuy: $('tool-buy'), toolIcon: $('tool-icon'),
      toolName: $('tool-name'), toolEffect: $('tool-effect'), toolCost: $('tool-cost'),
      trees: Object.fromEntries(SKILL_IDS.map((id) => [id, $(`tree-${id}`)])),
      pipSkills: $('pip-skills'), fed: $('fed'), fedTime: $('fed-time'),
      workshop: $('workshop'), smithOdds: $('smith-odds'), toolWrap: $('tool-wrap'),
      smithCost: $('smith-cost'), smithRefine: $('smith-refine'),
      smithScrap: $('smith-scrap'), smithFloor: $('smith-floor'),
      pipTalents: $('pip-talents'), pipPrestige: $('pip-prestige'),
      presGain: $('pres-gain'), presHave: $('pres-have'), presCount: $('pres-count'),
      presBest: $('pres-best'), presNext: $('pres-next'), presGo: $('pres-go'),
      presGainBox: document.querySelector('.prestige__gain'),
      perks: $('perks'), perksList: $('perks-list'),
      tabForge: $('tab-forge'), pipForge: $('pip-forge'),
      dustHave: $('dust-have'), forgeList: $('forge-list'), odds: $('odds'),
      autoCraft: $('autocraft'), autoCraftWrap: $('autocraft-wrap'),
      reset: $('btn-reset'),
    };

    this.tab = 'upgrades';
    this.tree = 'talents';
    this.skill = 'mining';   // which skill the tab is showing, not what is equipped
    // Set while the tab is hidden and the fight is being fast-forwarded.
    // Nobody is looking, so skip the DOM: a two minute catch-up can contain
    // eighty auto-forges, and each one rebuilding the list and forcing a
    // layout for its glow is work spent on pixels that are not on screen.
    this.quiet = false;
    this.rows = new Map();
    this.nodes = [];

    this.slots = new Map();

    this.buildShop();
    this.buildTree(this.el.treeTalents, TALENT_TREE, 'talent');
    this.buildTree(this.el.treeRelics, RELIC_TREE, 'relic');
    for (const id of SKILL_IDS) this.buildTree(this.el.trees[id], SKILL_TREES[id], id);
    this.buildStock();
    this.buildForge();
    this.bind();

    battle.on('toast', (t) => this.toast(t));
  }

  // --- building -----------------------------------------------------
  buildShop() {
    const frag = document.createDocumentFragment();
    for (const up of UPGRADES) {
      const li = document.createElement('li');
      li.innerHTML = `
        <button class="up" type="button" data-key="${up.key}">
          <span class="up__meter"></span>
          <span class="up__icon"><i class="ico ico--lg ico--${up.icon}"></i></span>
          <span class="up__body">
            <span class="up__name"></span>
            <span class="up__effect"></span>
          </span>
          <span class="up__buy">
            <span class="up__lvl"></span>
            <span class="up__cost"></span>
          </span>
        </button>`;
      const button = li.querySelector('button');
      button.querySelector('.up__name').textContent = up.name;
      this.rows.set(up.key, {
        up, button,
        effect: button.querySelector('.up__effect'),
        lvl: button.querySelector('.up__lvl'),
        cost: button.querySelector('.up__cost'),
        meter: button.querySelector('.up__meter'),
        affordable: null,
      });
      frag.append(li);
    }
    this.el.shop.append(frag);
  }

  /** Builds the forge: one row per slot plus the odds table below. */
  buildForge() {
    const frag = document.createDocumentFragment();
    for (const slot of SLOTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.dataset.slot = slot.id;
      button.innerHTML = `
        <span class="slot__icon"><i class="ico ico--lg ico--${slot.icon}"></i></span>
        <span class="slot__body">
          <span class="slot__name">${slot.name}<em></em></span>
          <span class="slot__effect"></span>
        </span>
        <span class="slot__cost"></span>`;
      frag.append(button);
      this.slots.set(slot.id, {
        slot, button,
        rarity: button.querySelector('em'),
        effect: button.querySelector('.slot__effect'),
        cost: button.querySelector('.slot__cost'),
      });
    }
    this.el.forgeList.append(frag);

    this.refreshOdds();
  }

  /** Builds a tree: one branch per column, nodes joined by a wire. */
  buildTree(host, tree, kind) {
    const grid = document.createElement('div');
    grid.className = 'tree';

    for (const branch of tree) {
      const col = document.createElement('div');
      col.className = 'branch';
      col.style.setProperty('--accent', branch.accent);
      col.innerHTML = `<h3 class="branch__name">${branch.name}</h3>`;

      branch.nodes.forEach((node, index) => {
        if (index > 0) {
          const link = document.createElement('span');
          link.className = 'branch__link';
          col.append(link);
          this.nodes.at(-1).link = link;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'node';
        button.innerHTML = `
          <i class="ico ico--lg ico--${node.icon}"></i>
          <span class="node__name">${node.name}</span>
          <span class="node__rank">0/${node.max}</span>
          ${kind === 'relic' ? '<span class="node__cost"></span>' : ''}`;
        col.append(button);

        this.nodes.push({
          kind, branch, index, node, button,
          rank: button.querySelector('.node__rank'),
          cost: button.querySelector('.node__cost'),
          link: null,
        });
      });
      grid.append(col);
    }
    host.append(grid);
  }

  // --- events -------------------------------------------------------
  bind() {
    const { el, state, battle } = this;

    el.tabs.addEventListener('click', (e) => {
      const button = e.target.closest('.tab');
      if (button) this.showTab(button.dataset.tab);
    });

    el.treeSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button) this.showTree(button.dataset.tree);
    });

    el.shop.addEventListener('click', (e) => {
      const button = e.target.closest('.up');
      if (!button) return;
      if (!state.buy(button.dataset.key)) return;
      state.save();
      this.refreshShop(true);
      button.classList.remove('is-bought');
      void button.offsetWidth;
      button.classList.add('is-bought');
    });

    // Buying and reading a node share one tap: the click invests when it
    // can, and the line below explains what happened.
    for (const entry of this.nodes) {
      entry.button.addEventListener('click', () => {
        const bought = entry.kind === 'talent' ? state.buyTalent(entry.branch, entry.index)
          : entry.kind === 'relic' ? state.buyRelic(entry.branch, entry.index)
          : state.buySkillTalent(entry.kind, entry.branch, entry.index);
        if (bought) state.save();
        this.describe(entry);
        if (SKILLS[entry.kind]) this.refreshSkills(); else this.refreshTrees(true);
      });
      const show = () => this.describe(entry);
      entry.button.addEventListener('pointerenter', show);
      entry.button.addEventListener('focus', show);
    }

    el.skillSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button) this.showSkill(button.dataset.skill);
    });

    el.skillEquip.addEventListener('click', () => {
      if (!state.equip(this.skill)) return;
      battle.working = null;
      state.save();
      this.toast({ text: `${SKILLS[this.skill].toolName.toUpperCase()} OUT` });
      this.refreshSkills();
    });

    el.stock.addEventListener('click', (e) => {
      const row = e.target.closest('.ore');
      if (!row) return;
      const entry = this.stockRows.get(row.dataset.resource);
      const made = state.refine(entry.skill, entry.resource);
      if (!made) return;
      state.save();
      this.toast({ text: `+${fmt(made)} ${entry.resource.name} ${SKILLS[entry.skill].refinedName}(s)` });
      this.refreshSkills();
    });

    el.toolBuy.addEventListener('click', () => {
      const id = this.skill;
      const next = state.nextTool(id);
      if (!next || !state.buyTool(id)) return;
      state.save();
      this.toast({ text: `${toolName(id, next.tier).toUpperCase()}!` });
      this.refreshSkills();
    });

    el.respecSkill.addEventListener('click', () => {
      if (!state.skillSpent(this.skill)) return;
      if (!confirm(`Refund every ${SKILLS[this.skill].name} point so you can respend them?`)) return;
      state.respecSkill(this.skill);
      state.save();
      this.refreshSkills();
    });

    el.forgeList.addEventListener('click', (e) => {
      const button = e.target.closest('.slot');
      if (button) this.doForge(button.dataset.slot);
    });

    el.autoCraft.checked = state.autoCraftOn !== false;
    el.autoCraft.addEventListener('change', () => {
      state.autoCraftOn = el.autoCraft.checked;
      state.save();
    });

    el.respec.addEventListener('click', () => {
      if (!state.spentPoints) return;
      if (!confirm('Refund every skill point so you can respend them?')) return;
      state.respecTalents();
      state.save();
      this.refreshTrees(true);
    });

    el.buyMax.checked = state.buyMax;
    el.buyMax.addEventListener('change', () => {
      state.buyMax = el.buyMax.checked;
      this.refreshShop(true);
    });

    el.stagePrev.addEventListener('click', () => battle.goToStage(state.stage - 1));
    el.stageNext.addEventListener('click', () => battle.goToStage(state.stage + 1));

    el.presGo.addEventListener('click', () => {
      const gain = state.pendingRelics;
      if (gain <= 0) return;
      if (!confirm(`Rebirth now pays ${gain} relic(s).\n\nYou lose stage, gold, upgrades, level and skill points. Confirm?`)) return;
      state.prestige();
      battle.enterStage(state.startStage, { silent: true });
      this.refreshShop(true);
      this.refreshTrees(true);
      this.showTab('talents');
      this.showTree('relics');
      this.toast({
        text: state.prestiges === 1
          ? 'REBORN: THE FORGE IS OPEN'
          : `REBORN: +${gain} RELIC(S)`,
      });
    });

    el.reset.addEventListener('click', () => {
      if (!confirm('Erase EVERYTHING, relics and prestige included?')) return;
      GameState.wipe();
      location.reload();
    });
  }

  showTab(name) {
    this.tab = name;
    for (const button of this.el.tabs.querySelectorAll('.tab')) {
      button.classList.toggle('is-on', button.dataset.tab === name);
    }
    for (const pane of document.querySelectorAll('.pane')) {
      pane.classList.toggle('is-on', pane.id === `pane-${name}`);
    }
    if (name === 'talents') this.refreshTrees(true);
    if (name === 'skills') this.refreshSkills();
    if (name === 'forge') this.refreshForge();
    if (name === 'prestige') this.refreshPrestige();
  }

  showTree(name) {
    this.tree = name;
    for (const button of this.el.treeSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.tree === name);
    }
    this.el.treeTalents.hidden = name !== 'talents';
    this.el.treeRelics.hidden = name !== 'relics';
    this.el.treePoints.classList.toggle('is-relic', name === 'relics');
    this.el.respec.hidden = name !== 'talents';
    setText(this.el.treeDetail, 'Tap a node to invest.');
    this.refreshTrees(true);
  }

  /** Where a tree keeps its ranks. One map per kind, same shape. */
  ranksFor(kind) {
    if (kind === 'relic') return this.state.relicTalents;
    if (SKILLS[kind]) return this.state.skillTalents[kind];
    return this.state.talents;
  }

  /** Explanation line for the node being touched. */
  describe(entry) {
    const { state } = this;
    const { node, kind, branch, index } = entry;
    const ranksOf = this.ranksFor(kind);
    const ranks = ranksOf[node.id] ?? 0;
    const locked = !state.isUnlocked(branch, index, ranksOf);

    const say = SKILLS[kind] ? describeGatherNode : describeNode;
    const now = ranks > 0 ? `now: ${say(node, ranks)}` : 'no points yet';
    let line;
    if (locked) {
      line = `<b>${node.name}</b> is locked: invest in <b>${branch.nodes[index - 1].name}</b> first.`;
    } else if (ranks >= node.max) {
      line = `<b>${node.name}</b> is maxed. ${say(node, ranks)}.`;
    } else {
      const price = kind === 'relic' ? `${relicCost(node, ranks)} relic(s)` : '1 point';
      line = `<b>${node.name}</b> (${ranks}/${node.max}), ${now}. Next point: <b>${say(node, ranks + 1)}</b> for ${price}.`;
    }
    setHtml(SKILLS[kind] ? this.el.skillDetail : this.el.treeDetail, line);
  }

  toast({ text, bad = false }) {
    if (this.quiet) return;
    const el = this.el.toast;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-bad', bad);
    // Restart the animation even if the previous toast is still on screen.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 900);
  }

  // --- per-frame update -----------------------------------------------
  update(dt) {
    const { state, battle, el } = this;

    setText(el.gold, fmt(state.gold));
    setText(el.gps, fmt(state.goldPerSec));
    setText(el.level, String(state.level));

    const need = state.xpNeeded;
    el.xpFill.style.width = `${Math.min(100, (state.xp / need) * 100).toFixed(1)}%`;
    setText(el.xpText, `${fmt(state.xp)} / ${fmt(need)}`);

    const encounter = battle.nextEncounter();
    setText(el.stageName, `Stage ${state.stage}`);
    el.stageName.classList.toggle('is-boss', encounter === 'boss');
    setText(el.stageSub, {
      boss: 'boss',
      elite: 'mini boss',
      mob: `${state.kills} / ${state.killsPerStage}`,
    }[encounter]);
    setText(el.best, String(state.bestStage));
    setText(el.stageFoot, String(state.stage));

    el.progress.style.width = `${(battle.stageProgress * 100).toFixed(1)}%`;
    el.progress.classList.toggle('is-boss', encounter !== 'mob');

    const showTimer = battle.enemy?.isBoss === true;
    el.bossTimer.hidden = !showTimer;
    if (showTimer) setText(el.bossValue, Math.max(0, battle.bossTimer).toFixed(1));

    el.stagePrev.disabled = state.stage <= 1;
    el.stageNext.disabled = state.stage >= state.maxStage;

    // "there is something to spend here" markers
    el.pipTalents.hidden = state.freePoints <= 0 && state.relics <= 0;
    el.pipSkills.hidden = !SKILL_IDS.some((id) => state.skillFree(id) > 0)
      && !GATHER_IDS.some((id) => state.canBuyTool(id));
    el.pipSkills.classList.add('pip--gold');

    // Well Fed is a live combat state, so it lives in the HUD, not the tab.
    el.fed.hidden = !state.fed;
    if (state.fed) setText(el.fedTime, String(Math.ceil(state.fedTimer)));
    el.pipPrestige.hidden = state.pendingRelics <= 0;
    el.pipPrestige.classList.add('pip--gold');
    el.tabForge.hidden = !state.forgeUnlocked;
    el.pipForge.hidden = !state.forgeUnlocked || !SLOTS.some((sl) => state.canForge(sl.id));
    el.pipForge.classList.add('pip--gold');

    this.tickAutomation(dt);

    this._timer = (this._timer ?? 0) + dt;
    if (this._timer < 0.15) return;
    this._timer = 0;

    if (this.tab === 'upgrades') this.refreshShop();
    else if (this.tab === 'talents') this.refreshTrees();
    else if (this.tab === 'skills') this.refreshSkills();
    else if (this.tab === 'forge') this.refreshForge();
    else this.refreshPrestige();
  }

  /**
   * Which upgrade gives the most power per coin right now. It measures the
   * relative gain by bumping the level for an instant and undoing it;
   * `statValue` is pure, so this leaves no trace on the state.
   */
  bestBuy() {
    const { state } = this;
    let best = null;
    let bestScore = 0;
    for (const up of UPGRADES) {
      const key = up.key;
      if (state.isMaxed(key)) continue;
      const price = state.costOf(key);
      if (price > state.gold) continue;

      const [measure, weight] = SCORE[key];
      const before = measure(state);
      state.levels[key] += 1;
      const after = measure(state);
      state.levels[key] -= 1;

      const score = ((after / before) - 1) * weight / price;
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return best;
  }

  refreshShop(force = false) {
    const { state, el } = this;
    const best = this.bestBuy();
    let affordable = 0;
    let cheapest = Infinity;

    for (const row of this.rows.values()) {
      const key = row.up.key;
      const lvl = state.levels[key];
      const maxed = state.isMaxed(key);
      const n = state.bulkFor(key);
      const can = n > 0;
      const price = maxed ? 0 : state.priceFor(key, Math.max(1, n));

      if (can) affordable += 1;
      if (!maxed && !can) cheapest = Math.min(cheapest, state.costOf(key));

      if (force || row.affordable !== can) {
        row.affordable = can;
        row.button.disabled = !can;
      }
      row.button.classList.toggle('up--max', maxed);
      row.button.classList.toggle('up--best', key === best);

      setText(row.effect, row.up.describe(lvl));
      setText(row.lvl, n > 1 ? `Lv. ${lvl} → ${lvl + n}` : `Lv. ${lvl}`);
      setHtml(row.cost, maxed
        ? 'MAX'
        : `<i class="ico ico--gold"></i> ${fmt(price)}`);

      // "how much is missing" bar on rows you cannot afford yet
      row.meter.style.width = can || maxed
        ? '0%'
        : `${Math.min(100, (state.gold / state.costOf(key)) * 100).toFixed(1)}%`;
    }

    this.refreshStatbar();
    if (affordable > 0) {
      setText(el.shopHint, affordable === 1 ? '1 upgrade available' : `${affordable} upgrades available`);
    } else if (isFinite(cheapest) && state.goldPerSec > 0) {
      setText(el.shopHint, `Next one in ~${duration((cheapest - state.gold) / state.goldPerSec)}`);
    } else {
      setText(el.shopHint, 'Gather more gold');
    }
  }

  // --- forge --------------------------------------------------------
  /** Forges a slot and reports what came out. */
  doForge(slotId, quiet = false) {
    const result = this.state.forge(slotId);
    if (!result) return null;
    this.state.save();

    if (this.quiet) return result;

    const entry = this.slots.get(slotId);
    const rarity = RARITIES[result.rolled];
    if (result.equipped) {
      entry.button.classList.remove('is-new');
      void entry.button.offsetWidth;
      entry.button.classList.add('is-new');
      if (!quiet || result.rolled >= 3) {
        this.toast({ text: `${rarity.name.toUpperCase()} ${entry.slot.name.toUpperCase()}!` });
      }
    } else if (!quiet) {
      this.toast({ text: `${rarity.name}: worse than equipped, +${result.refund} dust`, bad: true });
    }
    this.refreshForge();
    return result;
  }

  /** The forge odds are no longer fixed: Smithing moves them. */
  refreshOdds() {
    const odds = rarityOdds(this.state.forgeQuality);
    setHtml(this.el.odds, RARITIES.map((r, i) =>
      `<div style="--rar:${r.color}"><dt style="color:${r.color}">${r.name}</dt>`
      + `<dd style="color:${r.color}">${(odds[i] * 100).toFixed(1)}%</dd></div>`).join(''));
  }

  refreshForge() {
    this.refreshOdds();
    const { state, el } = this;
    setText(el.dustHave, fmt(state.dust));

    const hasAnvil = state.bonus.autoCraft > 0;
    el.autoCraftWrap.hidden = !hasAnvil;

    for (const entry of this.slots.values()) {
      const equipped = state.gear[entry.slot.id];
      const maxed = equipped === RARITIES.length - 1;
      const rarity = equipped == null ? null : RARITIES[equipped];
      const cost = state.costToForge(entry.slot.id);

      entry.button.style.setProperty('--rar', rarity?.color ?? '#6f6e72');
      entry.button.classList.toggle('slot--empty', equipped == null);
      entry.button.classList.toggle('slot--maxed', maxed);
      entry.button.disabled = !state.canForge(entry.slot.id);

      setText(entry.rarity, rarity ? rarity.name : 'empty');
      setText(entry.effect, equipped == null
        ? 'nothing equipped'
        : describeGear(entry.slot, equipped));
      setHtml(entry.cost, maxed
        ? 'maxed'
        : `<i class="ico ico--sm ico--dust"></i> ${cost}`);
    }
  }

  /**
   * Herald buys the best upgrade on its own; Anvil forges the cheapest slot.
   * Both only do what a finger would do, nothing the player could not do by
   * hand.
   */
  /**
   * Herald and Anvil, on a timer.
   *
   * `dt` is one frame while you are watching, but a whole minute when the
   * background loop hands over a catch-up, so both act in a loop instead of
   * firing once per call. Without that, looking away turns "buys every 6s"
   * into "buys every wake", and automation gets worse the longer you leave
   * it, which is backwards. AUTOMATION_CATCHUP caps the loop so a resume
   * from a long freeze cannot stall the thread.
   */
  tickAutomation(dt) {
    const { state } = this;

    if (state.bonus.autoBuy > 0) {
      const every = Math.max(1, AUTO_BUY_BASE - state.bonus.autoBuy + 1);
      this._autoBuy = (this._autoBuy ?? 0) + dt;
      let budget = AUTOMATION_CATCHUP;
      let bought = false;
      while (this._autoBuy >= every && budget > 0) {
        budget -= 1;
        this._autoBuy -= every;
        const key = this.bestBuy();
        // Nothing affordable: stop here rather than burning the backlog on
        // failed attempts, and let the next tick try again.
        if (!key || !state.buy(key)) break;
        bought = true;
      }
      this._autoBuy = Math.min(this._autoBuy, every);
      if (bought) {
        state.save();
        if (!this.quiet && this.tab === 'upgrades') this.refreshShop(true);
      }
    }

    if (state.bonus.autoCraft > 0 && state.autoCraftOn !== false) {
      this._autoForge = (this._autoForge ?? 0) + dt;
      let budget = AUTOMATION_CATCHUP;
      while (this._autoForge >= AUTO_FORGE_EVERY && budget > 0) {
        budget -= 1;
        this._autoForge -= AUTO_FORGE_EVERY;
        const slotId = state.cheapestForgeable();
        if (!slotId) break;
        this.doForge(slotId, true);
      }
      this._autoForge = Math.min(this._autoForge, AUTO_FORGE_EVERY);
    }
  }

  /** One row per resource, across all three skills: raw, refined, and refine. */
  buildStock() {
    this.stockRows = new Map();
    for (const id of GATHER_IDS) {
      const skill = SKILLS[id];
      for (const resource of skill.resources) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ore';
        row.dataset.resource = resource.id;
        row.dataset.skill = id;
        row.style.setProperty('--ore', resource.color);
        row.innerHTML = `
          <span class="ore__name">${resource.name}</span>
          <span class="ore__have"><i class="ico ico--sm ico--${skill.rawIcon}"></i><b>0</b></span>
          <span class="ore__have"><i class="ico ico--sm ico--${skill.refinedIcon}"></i><b>0</b></span>
          <span class="ore__smelt">${skill.verb.toLowerCase()}</span>`;
        this.el.stock.append(row);
        this.stockRows.set(resource.id, {
          skill: id, resource, row,
          raw: row.querySelectorAll('b')[0],
          refined: row.querySelectorAll('b')[1],
          action: row.querySelector('.ore__smelt'),
        });
      }
    }
  }

  showSkill(id) {
    this.skill = id;
    for (const button of this.el.skillSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.skill === id);
    }
    for (const other of SKILL_IDS) this.el.trees[other].hidden = other !== id;
    setText(this.el.skillDetail, 'Tap a node to invest.');
    this.refreshSkills();
  }

  refreshSkills() {
    const { state, el } = this;
    const id = this.skill;
    const skill = SKILLS[id];
    const level = state.skills[id];

    const need = state.gatherXpNeeded(id);
    el.skillXpFill.style.width = `${Math.min(100, (level.xp / need) * 100).toFixed(1)}%`;
    setText(el.skillXpText, `${fmt(level.xp)} / ${fmt(need)}`);
    setHtml(el.skillPoints,
      `Lv <b>${level.level}</b>, <b>${state.skillFree(id)}</b> pt`);

    // The equip button IS the tradeoff, so it says which state it is in
    // rather than only what it would do.
    const gathers = skill.gathers === true;
    el.stock.hidden = !gathers;
    el.toolWrap.hidden = !gathers;
    el.workshop.hidden = gathers;
    el.skillEquip.hidden = !gathers;
    if (!gathers) { this.refreshWorkshop(); return this.refreshSkillTree(id); }

    const equipped = state.tool === id;
    el.equipIcon.className = `ico ico--lg ico--${skill.toolIcon}`;
    setText(el.equipLabel, equipped ? `${skill.toolName} in hand` : `Take the ${skill.toolName}`);
    el.skillEquip.classList.toggle('is-on', equipped);
    el.skillEquip.disabled = equipped;

    // Only this skill's resources; the others live behind the switch.
    const known = new Set(state.knownResources(id).map((r) => r.id));
    for (const [resourceId, entry] of this.stockRows) {
      const mine = entry.skill === id;
      entry.row.hidden = !mine || !known.has(resourceId);
      if (entry.row.hidden) continue;
      const raw = Math.floor(state.raw[resourceId] ?? 0);
      const refined = state.refined[resourceId] ?? 0;
      const ready = state.refinable(id, entry.resource);
      setText(entry.raw, fmt(raw));
      setText(entry.refined, fmt(refined));
      setText(entry.action, ready > 0 ? `+${fmt(ready)}` : `${state.refineCostFor(id, entry.resource)}:1`);
      entry.row.disabled = ready <= 0;
      entry.row.classList.toggle('can-smelt', ready > 0);
    }

    const tier = state.tools[id];
    const next = state.nextTool(id);
    el.toolIcon.className = `ico ico--lg ico--${skill.toolIcon}`;
    setText(el.toolName, next
      ? `${toolName(id, tier)} \u2794 ${toolName(id, next.tier)}`
      : toolName(id, tier));
    const bonus = state.gatherBonus(id);
    // A tool one tier up reaches the resource of that same tier, which is the
    // whole reason to buy it; speed and yield are the sweetener.
    const unlocks = next ? skill.resources.find((r) => r.tier === next.tier) : null;
    setText(el.toolEffect, next
      ? `${workTime(next.tier, bonus).toFixed(2)}s a node, ${mult(TOOL_TIERS[next.tier].yield)} yield`
        + (unlocks ? `, reaches ${unlocks.name}` : '')
      : `${workTime(tier, bonus).toFixed(2)}s a node, ${mult(TOOL_TIERS[tier].yield)} yield`);
    setHtml(el.toolCost, next
      ? `<i class="ico ico--sm ico--bar"></i>${fmt(state.refined[next.cost.ore] ?? 0)}/${next.cost.bars}`
        + ` <i class="ico ico--sm ico--plank"></i>${fmt(state.refined[next.cost.log] ?? 0)}/${next.cost.planks}`
      : 'maxed');
    el.toolBuy.disabled = !state.canBuyTool(id);
    el.toolBuy.style.setProperty('--rar', skill.accent);

    this.refreshSkillTree(id);
  }

  /** Live readout of everything Smithing is doing to the forge. */
  refreshWorkshop() {
    const { state, el } = this;
    const odds = rarityOdds(state.forgeQuality);
    const floor = Math.min(state.forgeFloor, RARITIES.length - 1);
    setHtml(el.smithOdds, RARITIES.map((r, i) =>
      `<div><dt style="color:${r.color}">${r.name}</dt>`
      + `<dd style="color:${r.color}">${(odds[i] * 100).toFixed(1)}%</dd></div>`).join(''));
    setText(el.smithCost, mult(state.forgeDiscount));
    setText(el.smithRefine, mult(state.gatherBonus('smithing').refineAll));
    const back = Math.min(0.95, 0.3 + state.gatherBonus('smithing').scrapBack);
    setText(el.smithScrap, pct(back, 0));
    setText(el.smithFloor, RARITIES[floor].name);
  }

  refreshSkillTree(id) {
    const { state } = this;
    for (const entry of this.nodes) {
      if (entry.kind !== id) continue;
      const ranksOf = state.skillTalents[id];
      const ranks = ranksOf[entry.node.id] ?? 0;
      const unlocked = state.isUnlocked(entry.branch, entry.index, ranksOf);
      const canBuy = state.canBuySkillTalent(id, entry.branch, entry.index);
      entry.button.disabled = !canBuy;
      entry.button.classList.toggle('is-ranked', ranks > 0);
      entry.button.classList.toggle('is-full', ranks >= entry.node.max);
      entry.button.classList.toggle('is-locked', !unlocked);
      entry.button.classList.toggle('can-buy', canBuy);
      setText(entry.rank, `${ranks}/${entry.node.max}`);
      if (entry.link) entry.link.classList.toggle('is-on', ranks > 0);
    }
  }

  refreshStatbar() {
    const { state, el } = this;
    setText(el.sbDps, fmt(state.dps));
    setText(el.sbHp, fmt(state.maxHp));
    setText(el.sbCrit, pct(state.critChance, 0));
    setText(el.sbGold, mult(state.goldGain));
  }

  refreshTrees() {
    const { state, el } = this;
    const relicMode = this.tree === 'relics';

    setHtml(el.treePoints, relicMode
      ? `<i class="ico ico--sm ico--relic"></i> <b>${fmt(state.relics)}</b> relics`
      : `<b>${state.freePoints}</b> free point(s)`);

    for (const entry of this.nodes) {
      if (SKILLS[entry.kind]) continue; // its own tab, its own refresh
      const isRelic = entry.kind === 'relic';
      if (isRelic !== relicMode) continue; // the other tree is hidden

      const ranksOf = isRelic ? state.relicTalents : state.talents;
      const ranks = ranksOf[entry.node.id] ?? 0;
      const unlocked = state.isUnlocked(entry.branch, entry.index, ranksOf);
      const full = ranks >= entry.node.max;
      const canBuy = isRelic
        ? state.canBuyRelic(entry.branch, entry.index)
        : state.canBuyTalent(entry.branch, entry.index);

      entry.button.disabled = !canBuy;
      entry.button.classList.toggle('is-ranked', ranks > 0);
      entry.button.classList.toggle('is-full', full);
      entry.button.classList.toggle('is-locked', !unlocked);
      entry.button.classList.toggle('can-buy', canBuy);
      setText(entry.rank, `${ranks}/${entry.node.max}`);
      if (entry.cost) setText(entry.cost, full ? 'max' : `${relicCost(entry.node, ranks)}r`);
      if (entry.link) entry.link.classList.toggle('is-on', ranks > 0);
    }
  }

  refreshPrestige() {
    const { state, el } = this;
    const gain = state.pendingRelics;
    setText(el.presGain, String(gain));
    setText(el.presHave, fmt(state.relics));
    setText(el.presCount, String(state.prestiges));
    setText(el.presBest, String(state.maxStage));

    // The next relic is measured from what the current run is already worth
    // rather than what was collected, otherwise someone on stage 38 with 3
    // pending relics would read "stage 25", which is long gone.
    const next = nextRelicStage(relicsEarnedAt(state.maxStage));
    setText(el.presNext, isFinite(next) ? `stage ${next}` : 'n/a');

    el.presGainBox.classList.toggle('is-empty', gain <= 0);
    this.refreshPerks();

    el.presGo.disabled = gain <= 0;
    setText(el.presGo, gain > 0
      ? `Rebirth for ${gain} relic(s)`
      : `Reach stage ${isFinite(next) ? next : PRESTIGE.minStage}`);
  }

  /** Lists what the relic tree already grants; hides itself when empty. */
  refreshPerks() {
    const { state, el } = this;
    const active = RELIC_TREE
      .flatMap((b) => b.nodes)
      .map((node) => [node, state.relicTalents[node.id] ?? 0])
      .filter(([, ranks]) => ranks > 0);

    el.perks.hidden = active.length === 0;
    if (!active.length) return;

    const html = active.map(([node, ranks]) =>
      `<li><i class="ico ico--sm ico--${node.icon}"></i>${node.name} <b>${describeNode(node, ranks)}</b></li>`
    ).join('');
    setHtml(el.perksList, html);
  }

  /** Notice for gold banked while the game was closed. */
  showOffline({ seconds, gold }) {
    this.toast({ text: `+${fmt(gold)} gold over ${duration(seconds)}` });
  }

  /**
   * What happened while the tab was hidden. The fight really ran, so this
   * reports the whole span, not just the gold: stages and levels are the
   * part you would otherwise have to go looking for.
   */
  showAway({ seconds, gold, stages, levels }) {
    if (seconds < 20) return;
    const parts = [];
    // Gold can end up lower than it started: Herald spends it while you are
    // away. Reporting a negative would read as a bug, so only what grew
    // makes the line.
    if (gold > 0) parts.push(`+${fmt(gold)} gold`);
    if (stages > 0) parts.push(`+${stages} stage${stages > 1 ? 's' : ''}`);
    if (levels > 0) parts.push(`+${levels} level${levels > 1 ? 's' : ''}`);
    if (!parts.length) return;
    this.toast({ text: `${parts.join(', ')} over ${duration(seconds)}` });
  }
}
