import { UPGRADES } from '../data/upgrades.js';
import { GameState } from '../game/state.js';
import { KILLS_PER_STAGE } from '../data/enemies.js';
import { fmt, duration } from '../format.js';

const $ = (id) => document.getElementById(id);

/** Atualiza `el.textContent` só quando o valor muda de verdade. */
function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
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
      stageName: $('stage-name'),
      stageSub: $('stage-sub'),
      stagePrev: $('stage-prev'),
      stageNext: $('stage-next'),
      progress: $('stage-progress'),
      gold: $('stat-gold'),
      dps: $('stat-dps'),
      best: $('stat-best'),
      bossTimer: $('boss-timer'),
      bossValue: $('boss-timer-value'),
      toast: $('toast'),
      list: $('shop-list'),
      buyMax: $('buy-max'),
      reset: $('btn-reset'),
    };

    this.rows = new Map();
    this.buildShop();
    this.bind();

    battle.on('toast', (t) => this.toast(t));
  }

  buildShop() {
    const frag = document.createDocumentFragment();
    for (const up of UPGRADES) {
      const li = document.createElement('li');
      li.innerHTML = `
        <button class="up" type="button" data-key="${up.key}">
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
        up,
        button,
        effect: button.querySelector('.up__effect'),
        lvl: button.querySelector('.up__lvl'),
        cost: button.querySelector('.up__cost'),
        affordable: null,
      });
      frag.append(li);
    }
    this.el.list.append(frag);
  }

  bind() {
    this.el.list.addEventListener('click', (e) => {
      const button = e.target.closest('.up');
      if (!button) return;
      const bought = this.state.buy(button.dataset.key);
      if (bought) {
        this.state.save();
        this.refreshShop(true);
      }
    });

    this.el.buyMax.checked = this.state.buyMax;
    this.el.buyMax.addEventListener('change', () => {
      this.state.buyMax = this.el.buyMax.checked;
      this.refreshShop(true);
    });

    this.el.stagePrev.addEventListener('click', () => this.battle.goToStage(this.state.stage - 1));
    this.el.stageNext.addEventListener('click', () => this.battle.goToStage(this.state.stage + 1));

    this.el.reset.addEventListener('click', () => {
      if (!confirm('Apagar o progresso e começar de novo?')) return;
      GameState.wipe();
      location.reload();
    });
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

  /** Chamado a cada quadro; o grosso do trabalho é throttled. */
  update(dt) {
    const { state, battle, el } = this;

    setText(el.gold, fmt(state.gold));
    setText(el.dps, fmt(state.dps));

    const encounter = battle.nextEncounter();
    setText(el.stageName, `Fase ${state.stage}`);
    el.stageName.classList.toggle('is-boss', encounter === 'boss');
    setText(el.stageSub, {
      boss: 'chefe',
      elite: 'mini-chefe',
      mob: `${state.kills} / ${KILLS_PER_STAGE}`,
    }[encounter]);
    setText(el.best, String(state.maxStage));

    el.progress.style.width = `${(battle.stageProgress * 100).toFixed(1)}%`;
    el.progress.classList.toggle('is-boss', encounter !== 'mob');

    const showTimer = battle.enemy?.isBoss === true;
    el.bossTimer.hidden = !showTimer;
    if (showTimer) setText(el.bossValue, Math.max(0, battle.bossTimer).toFixed(1));

    el.stagePrev.disabled = state.stage <= 1;
    el.stageNext.disabled = state.stage >= state.maxStage;

    this._shopTimer = (this._shopTimer ?? 0) + dt;
    if (this._shopTimer >= 0.12) {
      this._shopTimer = 0;
      this.refreshShop();
    }
  }

  refreshShop(force = false) {
    const { state } = this;
    for (const row of this.rows.values()) {
      const key = row.up.key;
      const lvl = state.levels[key];
      const maxed = state.isMaxed(key);
      const n = state.bulkFor(key);
      const can = n > 0;

      if (force || row.affordable !== can) {
        row.affordable = can;
        row.button.disabled = !can;
      }
      row.button.classList.toggle('up--max', maxed);
      setText(row.effect, row.up.describe(lvl));
      setText(row.lvl, n > 1 ? `Nv. ${lvl} → ${lvl + n}` : `Nv. ${lvl}`);

      const cost = maxed
        ? 'MÁX'
        : `<i class="ico ico--gold"></i> ${fmt(state.priceFor(key, Math.max(1, n)))}`;
      if (row.cost.innerHTML !== cost) row.cost.innerHTML = cost;
    }
  }

  /** Aviso de ganho enquanto o jogo estava fechado. */
  showOffline({ seconds, gold }) {
    this.toast({ text: `+${fmt(gold)} de ouro em ${duration(seconds)}` });
  }
}
