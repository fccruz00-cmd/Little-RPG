import { UPGRADES } from '../data/upgrades.js';
import { GameState } from '../game/state.js';
import { TALENT_TREE, RELIC_TREE, describeNode, relicCost } from '../data/talents.js';
import { nextRelicStage, relicsEarnedAt, PRESTIGE } from '../data/prestige.js';
import { AUTO_BUY_BASE } from '../data/talents.js';
import { SLOTS, RARITIES, RARITY_ODDS, describeGear } from '../data/gear.js';
import { fmt, pct, mult, duration } from '../format.js';

/**
 * Como medir o ganho de um upgrade, pra apontar o de melhor custo-benefício.
 * Sobreviver e andar valem menos que matar, daí os pesos.
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

/** Atualiza `el.textContent` só quando o valor muda de verdade. */
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
    this.rows = new Map();
    this.nodes = [];

    this.slots = new Map();

    this.buildShop();
    this.buildTree(this.el.treeTalents, TALENT_TREE, 'talent');
    this.buildTree(this.el.treeRelics, RELIC_TREE, 'relic');
    this.buildForge();
    this.bind();

    battle.on('toast', (t) => this.toast(t));
  }

  // ── construção ────────────────────────────────────────────────────
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

  /** Monta a forja: uma linha por slot e a tabela de chances embaixo. */
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

    this.el.odds.innerHTML = RARITIES.map((r, i) =>
      `<div style="--rar:${r.color}"><dt style="color:${r.color}">${r.name}</dt>` +
      `<dd style="color:${r.color}">${(RARITY_ODDS[i] * 100).toFixed(1)}%</dd></div>`
    ).join('');
  }

  /** Monta uma árvore: um galho por coluna, nós ligados por um fio. */
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

  // ── eventos ───────────────────────────────────────────────────────
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

    // Comprar e mostrar o detalhe do nó vivem no mesmo toque: o clique
    // investe (se der) e o texto de baixo explica o que aconteceu.
    for (const entry of this.nodes) {
      entry.button.addEventListener('click', () => {
        const bought = entry.kind === 'talent'
          ? state.buyTalent(entry.branch, entry.index)
          : state.buyRelic(entry.branch, entry.index);
        if (bought) state.save();
        this.describe(entry);
        this.refreshTrees(true);
      });
      const show = () => this.describe(entry);
      entry.button.addEventListener('pointerenter', show);
      entry.button.addEventListener('focus', show);
    }

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
      if (!confirm('Devolver todos os pontos de talento pra redistribuir?')) return;
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
      if (!confirm(`Renascer agora rende ${gain} relíquia(s).\n\nVocê perde fase, ouro, upgrades, nível e talentos. Confirma?`)) return;
      state.prestige();
      battle.enterStage(state.startStage, { silent: true });
      this.refreshShop(true);
      this.refreshTrees(true);
      this.showTab('talents');
      this.showTree('relics');
      this.toast({
        text: state.prestiges === 1
          ? `RENASCEU — A FORJA ABRIU`
          : `RENASCEU — +${gain} RELÍQUIA(S)`,
      });
    });

    el.reset.addEventListener('click', () => {
      if (!confirm('Apagar TUDO, inclusive relíquias e prestígio?')) return;
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
    setText(this.el.treeDetail, 'Toque num nó pra investir.');
    this.refreshTrees(true);
  }

  /** Linha de explicação do nó tocado. */
  describe(entry) {
    const { state } = this;
    const { node, kind, branch, index } = entry;
    const ranks = (kind === 'talent' ? state.talents : state.relicTalents)[node.id] ?? 0;
    const locked = !state.isUnlocked(branch, index, kind === 'talent' ? state.talents : state.relicTalents);

    const now = ranks > 0 ? `agora: ${describeNode(node, ranks)}` : 'ainda sem pontos';
    let line;
    if (locked) {
      line = `<b>${node.name}</b> — trancado: invista em <b>${branch.nodes[index - 1].name}</b> primeiro.`;
    } else if (ranks >= node.max) {
      line = `<b>${node.name}</b> — no máximo. ${describeNode(node, ranks)}.`;
    } else {
      const price = kind === 'relic' ? `${relicCost(node, ranks)} relíquia(s)` : '1 ponto';
      line = `<b>${node.name}</b> (${ranks}/${node.max}) — ${now}. Próximo ponto: <b>${describeNode(node, ranks + 1)}</b> por ${price}.`;
    }
    setHtml(this.el.treeDetail, line);
  }

  toast({ text, bad = false }) {
    const el = this.el.toast;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-bad', bad);
    // Reinicia a animação mesmo se o toast anterior ainda estiver na tela.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 900);
  }

  // ── atualização por quadro ────────────────────────────────────────
  update(dt) {
    const { state, battle, el } = this;

    setText(el.gold, fmt(state.gold));
    setText(el.gps, fmt(state.goldPerSec));
    setText(el.level, String(state.level));

    const need = state.xpNeeded;
    el.xpFill.style.width = `${Math.min(100, (state.xp / need) * 100).toFixed(1)}%`;
    setText(el.xpText, `${fmt(state.xp)} / ${fmt(need)}`);

    const encounter = battle.nextEncounter();
    setText(el.stageName, `Fase ${state.stage}`);
    el.stageName.classList.toggle('is-boss', encounter === 'boss');
    setText(el.stageSub, {
      boss: 'chefe',
      elite: 'mini-chefe',
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

    // marcadores de "tem coisa pra gastar aqui"
    el.pipTalents.hidden = state.freePoints <= 0 && state.relics <= 0;
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
    else if (this.tab === 'forge') this.refreshForge();
    else this.refreshPrestige();
  }

  /**
   * Qual upgrade dá mais poder por moeda agora. Mede o ganho relativo
   * subindo o nível por um instante e desfazendo — `statValue` é puro, então
   * isso não deixa rastro no estado.
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
      setText(row.lvl, n > 1 ? `Nv. ${lvl} → ${lvl + n}` : `Nv. ${lvl}`);
      setHtml(row.cost, maxed
        ? 'MÁX'
        : `<i class="ico ico--gold"></i> ${fmt(price)}`);

      // barra de "quanto falta" nas linhas que ainda não dá pra comprar
      row.meter.style.width = can || maxed
        ? '0%'
        : `${Math.min(100, (state.gold / state.costOf(key)) * 100).toFixed(1)}%`;
    }

    this.refreshStatbar();
    if (affordable > 0) {
      setText(el.shopHint, affordable === 1 ? '1 upgrade disponível' : `${affordable} upgrades disponíveis`);
    } else if (isFinite(cheapest) && state.goldPerSec > 0) {
      setText(el.shopHint, `Próximo em ~${duration((cheapest - state.gold) / state.goldPerSec)}`);
    } else {
      setText(el.shopHint, 'Junte mais ouro');
    }
  }

  // ── forja ─────────────────────────────────────────────────────────
  /** Forja num slot e conta o que saiu. */
  doForge(slotId, quiet = false) {
    const result = this.state.forge(slotId);
    if (!result) return null;
    this.state.save();

    const entry = this.slots.get(slotId);
    const rarity = RARITIES[result.rolled];
    if (result.equipped) {
      entry.button.classList.remove('is-new');
      void entry.button.offsetWidth;
      entry.button.classList.add('is-new');
      if (!quiet || result.rolled >= 3) {
        this.toast({ text: `${entry.slot.name.toUpperCase()} ${rarity.name.toUpperCase()}!` });
      }
    } else if (!quiet) {
      this.toast({ text: `${rarity.name} — pior que a atual, +${result.refund} poeira`, bad: true });
    }
    this.refreshForge();
    return result;
  }

  refreshForge() {
    const { state, el } = this;
    setText(el.dustHave, fmt(state.dust));

    const hasAnvil = state.bonus.autoCraft > 0;
    el.autoCraftWrap.hidden = !hasAnvil;

    for (const entry of this.slots.values()) {
      const equipped = state.gear[entry.slot.id];
      const maxed = equipped === RARITIES.length - 1;
      const rarity = equipped == null ? null : RARITIES[equipped];
      const cost = state.costToForge(entry.slot.id);

      entry.button.style.setProperty('--rar', rarity?.color ?? '#3a3048');
      entry.button.classList.toggle('slot--empty', equipped == null);
      entry.button.classList.toggle('slot--maxed', maxed);
      entry.button.disabled = !state.canForge(entry.slot.id);

      setText(entry.rarity, rarity ? rarity.name : 'vazio');
      setText(entry.effect, equipped == null
        ? 'nada equipado'
        : describeGear(entry.slot, equipped));
      setHtml(entry.cost, maxed
        ? 'no topo'
        : `<i class="ico ico--sm ico--dust"></i> ${cost}`);
    }
  }

  /**
   * Arauto compra o melhor upgrade sozinho; Bigorna forja sozinha no slot
   * mais barato. Os dois fazem o que o dedo faria — nada que o jogador não
   * pudesse fazer na mão.
   */
  tickAutomation(dt) {
    const { state } = this;

    if (state.bonus.autoBuy > 0) {
      this._autoBuy = (this._autoBuy ?? 0) + dt;
      const every = Math.max(1, AUTO_BUY_BASE - state.bonus.autoBuy + 1);
      if (this._autoBuy >= every) {
        this._autoBuy = 0;
        const key = this.bestBuy();
        if (key && state.buy(key)) {
          state.save();
          if (this.tab === 'upgrades') this.refreshShop(true);
        }
      }
    }

    if (state.bonus.autoCraft > 0 && state.autoCraftOn !== false) {
      this._autoForge = (this._autoForge ?? 0) + dt;
      if (this._autoForge >= 1.5) {
        this._autoForge = 0;
        const slotId = state.cheapestForgeable();
        if (slotId) this.doForge(slotId, true);
      }
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
      ? `<i class="ico ico--sm ico--relic"></i> <b>${fmt(state.relics)}</b> relíquias`
      : `<b>${state.freePoints}</b> ponto(s) livre(s)`);

    for (const entry of this.nodes) {
      const isRelic = entry.kind === 'relic';
      if (isRelic !== relicMode) continue; // a outra árvore está escondida

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
      if (entry.cost) setText(entry.cost, full ? '—' : `${relicCost(entry.node, ranks)} ⬦`);
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

    // A próxima relíquia é medida a partir do que a corrida atual já vale,
    // não do que já foi recebido: senão, quem está na fase 38 com 3 relíquias
    // pendentes leria "fase 25", que já passou.
    const next = nextRelicStage(relicsEarnedAt(state.maxStage));
    setText(el.presNext, isFinite(next) ? `fase ${next}` : '—');

    el.presGainBox.classList.toggle('is-empty', gain <= 0);
    this.refreshPerks();

    el.presGo.disabled = gain <= 0;
    setText(el.presGo, gain > 0
      ? `Renascer por ${gain} relíquia(s)`
      : `Avance até a fase ${isFinite(next) ? next : PRESTIGE.minStage}`);
  }

  /** Lista o que a árvore de relíquias já garante — some se ainda não há nada. */
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

  /** Aviso de ganho enquanto o jogo estava fechado. */
  showOffline({ seconds, gold }) {
    this.toast({ text: `+${fmt(gold)} de ouro em ${duration(seconds)}` });
  }
}
