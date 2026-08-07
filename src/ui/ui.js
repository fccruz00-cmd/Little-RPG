import { UPGRADES } from '../data/upgrades.js';
import { STATS, statUnlocked } from '../data/balance.js';
import { GameState } from '../game/state.js';
import { describeNode, relicCost, soulCost } from '../data/talents.js';
import {
  TALENT_WEB, RELIC_WEB, SOUL_WEB, SKILL_WEBS, webUnlocked, webGate,
} from '../data/skilltree.js';
import {
  nextRelicStage, relicsEarnedAt, PRESTIGE,
  nextSoulRelics, soulsEarnedAt, AWAKEN,
} from '../data/prestige.js';
import { AUTO_BUY_BASE } from '../data/talents.js';
import {
  SLOTS, RARITIES, SET_BONUS, setRarity, describeGear, rarityOdds, describeEnchant,
} from '../data/gear.js';
import { KEYS, DUNGEON } from '../data/dungeon.js';
import { PETS, PET_BY_ID } from '../data/pets.js';
import { POTIONS } from '../data/potions.js';
import { DISHES } from '../data/dishes.js';
import {
  PLANETS, CONSTELLATIONS, CONSTELLATION_BY_ID, observeTime,
} from '../data/cosmos.js';
import { OMNI, OMNI_ROWS, omniTier, omniNext } from '../data/omni.js';
import { FEATS, featDone } from '../data/feats.js';
import { ANCESTORS, HALL } from '../data/ancestors.js';
import { DAILIES_PER_DAY, questProgress } from '../data/quests.js';
import { PATHS, describePath } from '../data/paths.js';
import { GEM_WARES, WARE_BY_ID } from '../data/gems.js';
import { Billing } from '../store/billing.js';
import { SPRITES, FRAME } from '../data/sprites.js';
import {
  SKILLS, SKILL_IDS, GATHER_IDS, TOOL_TIERS, toolName, workTime,
  describeGatherNode,
} from '../data/gathering.js';
import { fmt, pct, mult, duration, oddsPct } from '../format.js';
import {
  hasBackend, deviceId, cleanName, submit, flushQueue, fetchBoard,
  envelope, rememberMine,
} from '../net/leaderboard.js';
import { SFX } from '../engine/sfx.js';
import { t, lang, setLang } from '../i18n.js';
import { Music } from '../engine/music.js';

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
  // Effective health: armour is worth exactly what it saves you.
  armor:      [(s) => s.maxHp / s.damageTaken, 0.45],
  lifesteal:  [(s) => s.dps * (1 + s.lifesteal * 4), 0.5],
  ferocity:   [(s) => s.dps * (1 + s.doubleHit), 1],
  insight:    [(s) => s.xpGain, 0.4],
  // The gated shelves. Rough proxies on purpose: the star only has to rank
  // a purchase against the others, not price it exactly.
  bossDamage: [(s) => s.dps * (1 + s.bossDamage * 0.25), 0.8],
  thorns:     [(s) => 1 + s.thorns, 0.3],
  overkill:   [(s) => 1 + s.overkill, 0.5],
  dustFind:   [(s) => 1 + s.dustFind, 0.4],
  respawn:    [(s) => 1 / Math.max(0.05, s.respawnMul), 0.2],
  warChest:   [(s) => s.goldGain * (1 + s.warChest * 0.3), 0.6],
  might:      [(s) => s.dps, 1],
  reap:       [(s) => s.dps * (1 + s.reap * 2), 0.9],
  phoenix:    [(s) => 1 + s.phoenix, 0.3],
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

    // FIRST, before a single element is looked up. Some of the Portuguese
    // rewrites below replace a whole block's innerHTML, which destroys the
    // <b> inside it and builds a new one; anything that grabbed the old node
    // first would hold a detached element and quietly stop updating.
    this.applyStatic();

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
      quests: $('quests'), questsTitle: $('quests-title'), questsNext: $('quests-next'),
      treeSwitch: $('tree-switch'), treePoints: $('tree-points'), treeDetail: $('tree-detail'),
      respec: $('btn-respec'),
      treeTalents: $('tree-talents'), treeRelics: $('tree-relics'),
      treeSouls: $('tree-souls'), treeTabSouls: $('tree-tab-souls'), pipSouls: $('pip-souls'),
      skillSwitch: $('skill-switch'), skillPoints: $('skill-points'),
      skillDetail: $('skill-detail'), respecSkill: $('btn-respec-skill'),
      skillXpFill: $('skill-xp-fill'), skillXpText: $('skill-xp-text'),
      skillEquip: $('skill-equip'), equipIcon: $('equip-icon'), equipLabel: $('equip-label'),
      stock: $('stock'), toolBuy: $('tool-buy'), toolIcon: $('tool-icon'),
      toolName: $('tool-name'), toolEffect: $('tool-effect'), toolCost: $('tool-cost'),
      trees: Object.fromEntries(SKILL_IDS.map((id) => [id, $(`tree-${id}`)])),
      pipSkills: $('pip-skills'), fed: $('fed'), fedTime: $('fed-time'),
      workshop: $('workshop'), smithOdds: $('smith-odds'), toolWrap: $('tool-wrap'),
      keys: $('keys'), cauldron: $('cauldron'), cauldronWrap: $('cauldron-wrap'),
      kitchen: $('kitchen'), kitchenWrap: $('kitchen-wrap'),
      brews: $('brews'), brewsN: $('brews-n'),
      speed: $('btn-speed'),
      arenaAct: $('arena-act'), actBoss: $('act-boss'),
      actEnter: $('act-enter'), actBlood: $('act-blood'), actLeave: $('act-leave'),
      smithCost: $('smith-cost'), smithRefine: $('smith-refine'),
      smithScrap: $('smith-scrap'), smithFloor: $('smith-floor'),
      pipTalents: $('pip-talents'), pipPrestige: $('pip-prestige'),
      presGain: $('pres-gain'), presHave: $('pres-have'), presCount: $('pres-count'),
      presBest: $('pres-best'), presNext: $('pres-next'), presGo: $('pres-go'),
      presSprint: $('pres-sprint'), presClock: $('pres-clock'),
      presGainBox: document.querySelector('#asc-rebirth .prestige__gain'),
      ascSwitch: $('asc-switch'), ascSouls: $('asc-souls'), soulsHave: $('souls-have'),
      ascRebirth: $('asc-rebirth'), ascAwaken: $('asc-awaken'), pipAwaken: $('pip-awaken'),
      ascFeats: $('asc-feats'), featsList: $('feats-list'),
      awkGain: $('awk-gain'), awkHave: $('awk-have'), awkCount: $('awk-count'),
      awkSpent: $('awk-spent'), awkNext: $('awk-next'), awkGo: $('awk-go'),
      awkProgress: $('awk-progress'),
      awkGainBox: document.querySelector('#asc-awaken .prestige__gain'),
      paths: $('paths'), pathsTitle: $('paths-title'),
      pathList: $('path-list'), pathNote: $('path-note'),
      perks: $('perks'), perksList: $('perks-list'),
      tabForge: $('tab-forge'), pipForge: $('pip-forge'),
      tabHall: $('tab-hall'), pipHall: $('pip-hall'),
      hallList: $('hall-list'), hallDetail: $('hall-detail'),
      hallBless: $('hall-bless'),
      spiritsN: $('spirits-n'), reserveSwitch: $('reserve-switch'),
      hallReserveLabel: $('hall-reserve-label'),
      tabCosmos: $('tab-cosmos'), pipCosmos: $('pip-cosmos'),
      planetsFound: $('planets-found'), cosmosDetail: $('cosmos-detail'),
      cosmosSwitch: $('cosmos-switch'), skyStars: $('sky-stars'),
      planetarium: $('planetarium'), constellations: $('constellations'),
      omniList: $('omni-list'),
      pipPets: $('pip-pets'),
      petsList: $('pets-list'), petsCount: $('pets-count'), petDetail: $('pet-detail'),
      dustHave: $('dust-have'), forgeList: $('forge-list'), odds: $('odds'),
      autoCraft: $('autocraft'), autoCraftWrap: $('autocraft-wrap'),
      setStatus: $('set-status'),
      enchWrap: $('ench-wrap'), enchTitle: $('ench-title'), enchList: $('ench-list'),
      reset: $('btn-reset'), exportSave: $('btn-export'), importSave: $('btn-import'),
      gemPill: $('gem-pill'), gemCount: $('stat-gems'),
      gemShop: $('gemshop'), gemClose: $('gemshop-close'), wares: $('wares'),
      packs: $('packs'), gemMore: $('gem-more'), storeEmpty: $('store-empty'),
      store: $('btn-store'), storeModal: $('store'), storeClose: $('store-close'),
      options: $('btn-options'), optionsModal: $('options'),
      optSfx: $('opt-sfx'), optMusic: $('opt-music'), optFloat: $('opt-float'),
      langSwitch: $('lang-switch'), optionsClose: $('options-close'),
      importPane: $('import-pane'), importText: $('import-text'),
      importFile: $('import-file'), importGo: $('import-go'),
      ranksBtn: $('btn-ranks'), ranks: $('ranks'), ranksClose: $('ranks-close'),
      ranksTitle: $('ranks-title'), ranksNote: $('ranks-note'), ranksFoot: $('ranks-foot'),
      leagueSwitch: $('league-switch'), boardSwitch: $('board-switch'),
      rankList: $('rank-list'), rankName: $('rank-name'), rankSave: $('rank-save'),
    };

    this.tab = 'upgrades';
    this.tree = 'talents';
    this.asc = 'rebirth';    // which reset layer the Ascension tab shows
    this.skill = 'mining';   // which skill the tab is showing, not what is equipped
    // Set while the tab is hidden and the fight is being fast-forwarded.
    // Nobody is looking, so skip the DOM: a two minute catch-up can contain
    // eighty auto-forges, and each one rebuilding the list and forcing a
    // layout for its glow is work spent on pixels that are not on screen.
    this.quiet = false;
    this.rows = new Map();
    this.nodes = [];
    this.wires = new Map();

    this.slots = new Map();

    this.buildShop();
    this.buildQuests();
    this.buildWeb(this.el.treeTalents, TALENT_WEB, 'talent');
    this.buildWeb(this.el.treeRelics, RELIC_WEB, 'relic');
    this.buildWeb(this.el.treeSouls, SOUL_WEB, 'soul');
    for (const id of SKILL_IDS) this.buildWeb(this.el.trees[id], SKILL_WEBS[id], id);
    this.buildPaths();
    this.buildStock();
    this.buildKeys();
    this.buildCauldron();
    this.buildKitchen();
    this.buildCosmos();
    this.buildForge();
    this.buildHall();
    this.buildPets();
    this.buildFeats();
    this.buildWares();
    this.bind();
    this.labelTools();

    battle.on('toast', (t) => this.toast(t));
    // Every exit from a dungeon reports what it paid, however it ended: a
    // clear, a death in room six, or walking out with the boss still up.
    battle.on('reward', (out) => this.showReward(out));

    // The ear. Every play() checks quiet/mute/hidden itself, but quiet is
    // checked here too so a background catch-up does not queue a drumroll.
    this.sfx = new SFX(() => this.state.muted);
    battle.on('hit', ({ crit }) => { if (!this.quiet) this.sfx.play(crit ? 'crit' : 'hit'); });
    battle.on('heroHurt', ({ killed }) => { if (!this.quiet) this.sfx.play(killed ? 'down' : 'hurt'); });
    battle.on('spawn', (actor) => { if (!this.quiet && actor.isBoss) this.sfx.play('boss'); });
    battle.on('gather', () => { if (!this.quiet) this.sfx.play('gather'); });
    battle.on('kill', ({ target, levelsUp }) => {
      if (this.quiet) return;
      this.sfx.play(target.isBoss ? 'bossdown' : 'gold');
      if (levelsUp) this.sfx.play('level');
    });
    battle.on('toast', ({ text }) => {
      if (this.quiet) return;
      if (text.endsWith('TAMED!') || text.startsWith('FEAT:')) this.sfx.play('jingle');
    });
    battle.on('chest', () => { if (!this.quiet) this.sfx.play('chest'); });
    battle.on('shrine', () => { if (!this.quiet) this.sfx.play('brew'); });

    // The band. Generative, so it never repeats; the key follows the
    // descent, so stage 70 broods and stage 160 barely breathes.
    // The till. Finds nothing in a browser, which is the normal case, and
    // then the shop simply never grows a "More gems" section.
    this.billing = new Billing(state, (gems) => this.onGemsBought(gems));
    // Called either way: the store has something to say when it is empty.
    this.billing.connect().then(() => this.refreshPacks());

    // The boards. No backend configured means no button, no calls, and a
    // game exactly as offline as it always was. A failed submit from a past
    // session flushes quietly here.
    this.league = null;             // which league the modal is showing
    this.board = 'sprint';
    this.el.ranksBtn.hidden = !hasBackend();
    this.el.rankName.placeholder = t('your name');
    this.el.importText.placeholder = t('Paste your save here');
    if (hasBackend()) flushQueue();

    this.music = new Music(this.sfx, () => !this.state.musicOff);
    const moodFor = (stage) => (stage >= 150 ? 2 : stage >= 64 ? 1 : 0);
    this.music.setMood(moodFor(state.stage));
    battle.on('stage', (stage) => this.music.setMood(moodFor(stage)));
  }

  /**
   * Translates every string index.html shipped in English. Text nodes are
   * replaced in place so pips and icons survive; the rich blocks swap their
   * whole innerHTML, ids preserved. English is a no-op.
   */
  applyStatic() {
    // Every table below is a list of CSS selectors, several of them
    // positional (`:nth-child`, `:nth-of-type`, `~`). A selector that stops
    // matching because the markup moved fails SILENTLY and in one language
    // only: English never runs this, so the miss shows up as an untranslated
    // string on a Portuguese screen and nowhere else. The misses are counted
    // and shouted about, and a test asserts the count is zero.
    this.i18nMisses = [];
    if (lang !== 'pt') return;
    const TEXT = [
      ['[data-tab="upgrades"]', 'Shop'], ['[data-tab="talents"]', 'Talents'],
      ['[data-tab="skills"]', 'Skills'], ['[data-tab="cosmos"]', 'Cosmos'],
      ['[data-tab="forge"]', 'Forge'], ['[data-tab="hall"]', 'Ancestors'],
      ['[data-tab="pets"]', 'Pets'], ['[data-tab="prestige"]', 'Ascend'],
      ['[data-tree="talents"]', 'Talents'], ['[data-tree="relics"]', 'Relics'],
      ['[data-tree="souls"]', 'Souls'],
      ['[data-skill="mining"]', 'Mining'], ['[data-skill="chopping"]', 'Chopping'],
      ['[data-skill="fishing"]', 'Fishing'], ['[data-skill="smithing"]', 'Smithing'],
      ['[data-skill="alchemy"]', 'Alchemy'],
      ['[data-skill="farming"]', 'Farming'], ['[data-skill="cooking"]', 'Cooking'],
      ['[data-asc="rebirth"]', 'Rebirth'], ['[data-asc="awaken"]', 'Awaken'],
      ['[data-asc="feats"]', 'Feats'],
      ['[data-sky="planetarium"]', 'Planetarium'],
      ['[data-sky="constellations"]', 'Constellations'],
      ['[data-sky="omni"]', 'Omniscience'],
      ['[data-league="pure"]', 'Pure'], ['[data-league="gilded"]', 'Gilded'],
      ['[data-league="patron"]', 'Patron'],
      ['[data-board="sprint"]', 'Weekly sprint'], ['[data-board="best"]', 'Best stage'],
      ['#rank-save', 'Save name'], ['#ranks-close', 'Close'],
      ['#btn-respec', 'respec'], ['#btn-respec-skill', 'respec'],
      ['#act-boss', 'Try boss'], ['#act-blood', 'Bloodmoon'], ['#act-leave', 'Leave'],
      ['#pane-upgrades .toggle span', 'Buy max'],
      ['#autocraft-wrap span', 'Auto forge'],
      ['#equip-label', 'Equip'],
      ['#pane-pets .pane__hint', "Every tamed pet's buff is on."],
      ['#tree-detail', 'Tap a node to invest.'],
      ['#skill-detail', 'Tap a node to invest.'],
      ['#perks h3', 'Permanent bonuses'],
      ['#pres-go', 'Rebirth'], ['#awk-go', 'Awaken'],
      ['#btn-reset', 'Erase everything and start over'],
      ['#opt-title', 'Options'], ['#store-close', 'Close'],
      ['#opt-sfx ~ span', 'Sound effects'], ['#opt-music ~ span', 'Music'],
      ['#opt-float ~ span', 'Damage numbers'], ['#opt-lang', 'Language'],
      ['#opt-save-note', 'Back up or move your save between devices.'],
      ['#btn-export', 'Export save'], ['#btn-import', 'Import save'],
      ['#import-file-label', 'Read a file'], ['#import-go', 'Replace and load'],
      ['#import-note', 'This replaces the current save on this device.'],
      ['#options-close', 'Close'], ['#gemshop-close', 'Close'],
      ['#rotate-say', 'Turn your phone sideways'],
      ['#rotate-note', 'Little RPG is played in landscape.'],
      ['.loading span', 'loading...'],
    ];
    for (const [sel, key] of TEXT) {
      const el = this.pick(sel);
      if (!el) continue;
      // the first non-empty text node, so pips and icons stay put
      const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (node) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), t(key));
      else el.textContent = t(key);
    }
    // text that trails an icon: replace the LAST text node
    const TAIL = [
      ['#workshop .sect:nth-of-type(1)', 'Dungeon keys'],
      ['#workshop .sect:nth-of-type(2)', 'What smithing gives you'],
      ['#cauldron-title', 'Cauldron'],
      ['#kitchen-title', 'Kitchen'],
      ['#gem-title', 'Gem shop'],
      ['#store-title', 'Store'],
      ['#ranks-title', 'Leaderboards'],
    ];
    for (const [sel, key] of TAIL) {
      const el = this.pick(sel);
      const node = el && [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (node) node.nodeValue = ' ' + t(key);
    }
    const HTML = [
      ['.hud__lvl', `Nv.<b id="stat-level">1</b>`],
      ['.statbar div:nth-child(1) dt', `<i class="ico ico--sm ico--damage"></i>${t('dmg/s')}`],
      ['.statbar div:nth-child(2) dt', `<i class="ico ico--sm ico--health"></i>${t('health')}`],
      ['.statbar div:nth-child(3) dt', `<i class="ico ico--sm ico--crit"></i>${t('crit')}`],
      ['.statbar div:nth-child(4) dt', `<i class="ico ico--sm ico--gold"></i>${t('gold')}`],
      ['#pet-detail', 'Pets são domados <b>jogando os pilares do jogo</b> e sobem de nível <b>comendo peixe cru</b> das próprias águas. Todos os buffs somam e os níveis sobrevivem a <b>tudo</b>. E <b>um deles, à sua escolha, anda do seu lado</b>.'],
      ['#forge-detail', 'Mobs derrubam <b>pó de alma</b>. Cada forja rola uma raridade: melhor que a sua, ela se equipa sozinha; pior, vira pó de novo.'],
      ['#asc-rebirth .prestige__note', 'Renascer apaga <b>fase, ouro, upgrades, nível e pontos de talento</b>.<br>Você mantém suas <b>relíquias</b> e a <b>árvore de relíquias</b>, gastas na aba Talentos, e tudo da aba <b>Ofícios</b>: níveis de coleta, minério, barras e ferramentas.'],
      ['#asc-awaken .prestige__note', 'Despertar apaga tudo que o Renascer apaga <b>e mais: relíquias, a árvore de relíquias, renascimentos, pó e equipamento</b>. Você mantém suas <b>almas</b>, a <b>árvore de almas</b> na aba Talentos, e tudo da aba <b>Ofícios</b>. Almas vêm de cada relíquia que esta ascensão ganhou (<b id="awk-progress">0</b> até agora).'],
      ['#asc-feats .prestige__note', 'Feitos são marcas da vida inteira: os contadores nunca zeram, nem no despertar, e cada feito completo paga um <b>bônus permanente pequeno</b> para sempre.'],
      ['#gem-note', 'Gemas vêm de <b>masmorras limpas</b>, e ir mais fundo do que você já foi paga um prêmio. Tudo aqui é <b>consumível</b>: gemas compram ritmo, nunca um teto.'],
      ['#store-note', 'Gemas compram ritmo, nunca um teto, e <b>toda gema daqui também pode ser ganha</b> limpando masmorras. As compras são feitas pela loja do aparelho; o jogo nunca vê seus dados de pagamento.'],
      ['#gem-more', 'Sem gemas? Limpe uma masmorra, ou toque na bolsa lá em cima.'],
      ['#store-empty', '<b>Esta cópia do jogo não vende nada.</b> Não há loja de aplicativos conectada a ela, então não há nada aqui para comprar e nenhum jeito de ela cobrar seu dinheiro. Toda gema do jogo sai de uma masmorra: forje uma chave na aba Ofícios e vá gastá-la.'],
      ['.foot > span:first-child', `Fase <b id="stat-stage-foot">1</b>`],
      ['.foot__best', `Recorde: fase <b id="stat-best">1</b>`],
      ['#asc-rebirth .prestige__gain div', `<strong id="pres-gain">0</strong> relíquia(s)\n<small>${t('if you rebirth now')}</small>`],
      ['#asc-awaken .prestige__gain div', `<strong id="awk-gain">0</strong> alma(s)\n<small>${t('if you awaken now')}</small>`],
    ];
    for (const [sel, html] of HTML) {
      const el = this.pick(sel);
      if (el) el.innerHTML = html;
    }
    const DT = [
      ['#asc-rebirth .facts div:nth-child(1) dt', 'Relics banked'],
      ['#asc-rebirth .facts div:nth-child(2) dt', 'Rebirths'],
      ['#asc-rebirth .facts div:nth-child(3) dt', 'Deepest stage'],
      ['#asc-rebirth .facts div:nth-child(4) dt', 'Next relic'],
      ['#asc-rebirth .facts div:nth-child(5) dt', 'Best sprint'],
      ['#asc-rebirth .facts div:nth-child(6) dt', 'This run'],
      ['#asc-awaken .facts div:nth-child(1) dt', 'Souls to spend'],
      ['#asc-awaken .facts div:nth-child(2) dt', 'Awakenings'],
      ['#asc-awaken .facts div:nth-child(3) dt', 'Souls spent'],
      ['#asc-awaken .facts div:nth-child(4) dt', 'Next soul'],
      ['#workshop .facts div:nth-child(1) dt', 'Forge cost'],
      ['#workshop .facts div:nth-child(2) dt', 'Refining, all skills'],
      ['#workshop .facts div:nth-child(3) dt', 'Dust back on a miss'],
      ['#workshop .facts div:nth-child(4) dt', 'Never rolls below'],
    ];
    for (const [sel, key] of DT) {
      const el = this.pick(sel);
      if (el) el.textContent = t(key);
    }
    if (this.i18nMisses.length) {
      console.warn('i18n: selectors that matched nothing:', this.i18nMisses);
    }
  }

  /** querySelector that records a miss instead of shrugging one off. */
  pick(selector) {
    const el = document.querySelector(selector);
    if (!el) this.i18nMisses.push(selector);
    return el;
  }

  // --- building -----------------------------------------------------
  buildShop() {
    const frag = document.createDocumentFragment();
    // The two gated shelves each get a header row, hidden with the shelf, so
    // the six upgrades that appear on the first rebirth introduce themselves.
    this.shelves = new Map();
    for (const up of UPGRADES) {
      const gate = STATS[up.key].gate;
      if (gate && !this.shelves.has(gate)) {
        const head = document.createElement('li');
        head.className = 'shop__shelf';
        head.textContent = t(gate === 'awaken' ? 'Unlocked by awakening' : 'Unlocked by rebirth');
        frag.append(head);
        this.shelves.set(gate, head);
      }
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
      button.querySelector('.up__name').textContent = t(up.name);
      this.rows.set(up.key, {
        up, button, li,
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

  /**
   * The contract board: three dailies and the week's one, pinned above the
   * shop. Four fixed rows; what changes daily is what each row SAYS, so the
   * refresh writes text instead of rebuilding.
   */
  buildQuests() {
    setText(this.el.questsTitle, t('Contracts'));
    this.questRows = [];
    for (let i = 0; i < DAILIES_PER_DAY + 1; i++) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key quest';
      row.dataset.quest = String(i);
      row.innerHTML = `
        <span class="ore__name"></span>
        <span class="key__what"></span>
        <span class="ore__have"><b></b> <i class="ico ico--sm ico--gem"></i></span>
        <span class="ore__smelt"></span>`;
      this.el.quests.append(row);
      this.questRows.push({
        row, entry: null,
        name: row.querySelector('.ore__name'),
        what: row.querySelector('.key__what'),
        have: row.querySelector('b'),
        action: row.querySelector('.ore__smelt'),
      });
    }
  }

  refreshQuests(force = true) {
    // Contract progress moves when stats move and the countdown only needs
    // seconds, but this used to re-deal and re-write the board on every
    // 0.15s shop tick -- measurable at 6x CPU throttle, where those ticks
    // were the p95 frames. One repaint a second is plenty.
    const now = performance.now();
    if (!force && now - (this._questsAt ?? 0) < 1000) return;
    this._questsAt = now;
    const { state } = this;
    const { dailies, weekly } = state.questBoard();
    const list = [...dailies.map((q) => ({ q, weekly: false })), { q: weekly, weekly: true }];
    for (let i = 0; i < this.questRows.length; i++) {
      const r = this.questRows[i];
      const { q, weekly: isWeek } = list[i];
      r.entry = list[i];
      const snap = (isWeek ? state.quests.weekSnap : state.quests.snap) ?? {};
      const claimed = isWeek ? state.quests.weekClaimed : state.quests.claimed.includes(q.id);
      const can = state.canClaimQuest(q, isWeek);
      setText(r.name, t(isWeek ? 'Weekly' : 'Daily'));
      setHtml(r.what, `${t(q.desc)} &middot; ${fmt(questProgress(q, state.stats, snap))}/${fmt(q.need)}`);
      setText(r.have, `+${q.gems}`);
      setText(r.action, claimed ? t('paid') : can ? t('claim') : t('need'));
      r.row.disabled = !can;
      r.row.classList.toggle('can-smelt', can);
      r.row.classList.toggle('is-done', claimed);
    }
    // when the board turns over, so nobody has to guess the reset hour
    const left = (86400000 - (Date.now() % 86400000)) / 1000;
    setText(this.el.questsNext, t('new in {0}', duration(left)));
  }

  /**
   * Builds the pets list: one board per pet, all five present from the
   * start so the locked ones read as a roadmap, each objective a pillar of
   * the game (mining, rebirth, dungeons, awakening). Thumbnails are the
   * sprite's own idle frame, cropped to its body box and drawn pixelated,
   * because a pet that does not look like the thing following you is just
   * a stat row.
   */
  buildPets() {
    const frag = document.createDocumentFragment();
    this.petRows = new Map();
    for (const pet of PETS) {
      const row = document.createElement('div');
      row.className = 'pet';
      row.dataset.pet = pet.id;
      row.style.setProperty('--accent', pet.accent);
      row.innerHTML = `
        <canvas class="pet__thumb" width="26" height="26"></canvas>
        <span class="pet__body">
          <span class="pet__name">${pet.name} <em class="pet__lvl"></em></span>
          <span class="pet__effect"></span>
        </span>
        <span class="pet__acts">
          <button class="equip pet__feed" type="button">Feed</button>
          <button class="equip pet__walk" type="button"></button>
        </span>`;
      this.drawPetThumb(row.querySelector('canvas'), pet.sprite);
      frag.append(row);
      this.petRows.set(pet.id, {
        pet, row,
        lvl: row.querySelector('.pet__lvl'),
        effect: row.querySelector('.pet__effect'),
        feed: row.querySelector('.pet__feed'),
        walk: row.querySelector('.pet__walk'),
      });
    }
    this.el.petsList.append(frag);
  }

  /** Crops the body box out of the idle sheet's first frame, pixel-scaled. */
  drawPetThumb(canvas, spriteId) {
    const sheet = this.battle.sheets[spriteId]?.idle;
    const box = SPRITES[spriteId];
    if (!sheet || !box) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const w = box.right - box.left;
    const h = box.bottom - box.top + 1;
    const scale = Math.min(canvas.width / w, canvas.height / h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    ctx.drawImage(sheet.image, box.left, box.top, w, h,
      Math.floor((canvas.width - dw) / 2), canvas.height - dh, dw, dh);
  }

  /**
   * The Hall of Ancestors: one board per spirit, all eight up front so the
   * locked ones read as a roadmap, exactly like the pets. Each spirit is a
   * past life, so the portrait is the hero's own idle frame washed in the
   * spirit's colour -- the knight you were, gone a little translucent.
   */
  buildHall() {
    setText(this.el.hallDetail, t('Every rebirth leaves behind the hero you were. Give each spirit one upgrade to keep bought and it will, forever, through rebirth and awakening. Dust raises a spirit, buying more levels per visit.'));
    setText(this.el.hallReserveLabel, t('Gold reserve'));

    // The Ancestral Bounty: one board, hall-wide, priced in dust.
    const bless = document.createElement('button');
    bless.type = 'button';
    bless.className = 'ore key';
    bless.innerHTML = `
      <span class="ore__name"><i class="ico ico--sm ico--plank"></i> ${t('Ancestral Bounty')}</span>
      <span class="key__what"></span>
      <span class="ore__have"><b></b> <i class="ico ico--sm ico--dust"></i></span>
      <span class="ore__smelt"></span>`;
    this.el.hallBless.append(bless);
    this.blessRow = {
      row: bless,
      what: bless.querySelector('.key__what'),
      cost: bless.querySelector('b'),
      have: bless.querySelector('.ore__have'),
      action: bless.querySelector('.ore__smelt'),
    };

    const frag = document.createDocumentFragment();
    this.spiritRows = [];
    ANCESTORS.forEach((spirit, i) => {
      const row = document.createElement('div');
      row.className = 'pet spirit';
      row.style.setProperty('--accent', spirit.accent);
      row.innerHTML = `
        <canvas class="pet__thumb spirit__thumb" width="26" height="26"></canvas>
        <span class="pet__body">
          <span class="pet__name">${t(spirit.name)} <em class="pet__lvl"></em></span>
          <select class="spirit__task" aria-label="${t('Assignment')}"></select>
          <span class="pet__effect spirit__gain"></span>
          <span class="pet__effect spirit__locked"></span>
        </span>
        <button class="equip pet__feed spirit__up" type="button"></button>`;
      this.drawGhostThumb(row.querySelector('canvas'), spirit.accent);
      frag.append(row);
      this.spiritRows.push({
        spirit, i, row,
        lvl: row.querySelector('.pet__lvl'),
        task: row.querySelector('.spirit__task'),
        gain: row.querySelector('.spirit__gain'),
        locked: row.querySelector('.spirit__locked'),
        up: row.querySelector('.spirit__up'),
        options: '',
      });
    });
    this.el.hallList.append(frag);
  }

  /** The hero's idle frame, washed in the spirit's colour. Two source-atop
   *  passes, colour then white, so the wash also LIFTS the sprite: the
   *  knight's palette is dark, and a dark ghost just reads as a shadow. */
  drawGhostThumb(canvas, accent) {
    this.drawPetThumb(canvas, 'knight');
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  refreshHall(force = false) {
    const { state, el } = this;
    setText(el.spiritsN, `${state.spiritCount}/${ANCESTORS.length}`);
    for (const button of el.reserveSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on',
        Number(button.dataset.reserve) === state.ancestors.reserve);
    }

    // The bounty board: what a gather pays now, what the next level adds.
    const bounty = state.bounty;
    const atMax = state.bountyCost() == null;
    setHtml(this.blessRow.what,
      t('each gather pays {0} type(s) of its line at once', bounty + 1)
      + (atMax ? '' : `${t(' · next: ')}<b>${bounty + 2}</b>`));
    this.blessRow.have.style.visibility = atMax ? 'hidden' : 'visible';
    if (!atMax) setText(this.blessRow.cost, fmt(state.bountyCost()));
    setText(this.blessRow.action,
      atMax ? t('max') : state.canBuyBounty() ? t('raise') : t('need'));
    this.blessRow.row.disabled = !state.canBuyBounty();
    this.blessRow.row.classList.toggle('can-smelt', state.canBuyBounty());
    this.blessRow.row.classList.toggle('is-done', atMax);
    // The option list only moves when a shelf opens, so it is rebuilt
    // against a signature instead of on every 0.15s tick: an open <select>
    // whose options are replaced under the thumb closes itself on phones.
    const sig = state.spiritCount + ':' + UPGRADES
      .filter((u) => statUnlocked(u.key, state)).map((u) => u.key).join();
    const rebuild = force || sig !== this._hallSig;
    this._hallSig = sig;
    for (const r of this.spiritRows) {
      const woken = r.i < state.spiritCount;
      r.row.classList.toggle('is-locked', !woken);
      r.task.hidden = !woken;
      r.locked.hidden = woken;
      r.up.hidden = !woken;
      if (!woken) {
        setText(r.locked, t('wakes at {0} lifetime rebirth(s)', r.spirit.at));
        setText(r.lvl, '');
        r.gain.hidden = true;
        continue;
      }
      setText(r.lvl, `Lv. ${state.spiritLevel(r.i)}`);
      if (rebuild) {
        const opts = [`<option value="">${t('resting')}</option>`]
          .concat(UPGRADES
            .filter((u) => statUnlocked(u.key, state))
            .map((u) => `<option value="${u.key}">${t(u.name)}</option>`))
          .join('');
        if (r.options !== opts) { r.options = opts; r.task.innerHTML = opts; }
      }
      const want = state.ancestors.assign[r.i] ?? '';
      if (r.task.value !== want) r.task.value = want;
      // The receipt: the shop level this spirit keeps bought and what that
      // level pays right now, in the shop row's own words.
      const chore = want && UPGRADES.find((u) => u.key === want);
      r.gain.hidden = !chore;
      if (chore) {
        const lvl = state.levels[want] ?? 0;
        setText(r.gain, `Lv. ${lvl}: ${chore.describe(lvl)}`);
      }
      const maxed = state.spiritLevel(r.i) >= HALL.maxLevel;
      setHtml(r.up, maxed ? 'MAX'
        : `<i class="ico ico--sm ico--dust"></i> ${fmt(state.spiritUpCost(r.i))}`);
      const can = state.canUpgradeSpirit(r.i);
      r.up.disabled = !can;
      r.up.classList.toggle('can-buy', can);
    }
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

    // Enchant rows: one per slot, shown only while that slot carries one.
    setText(this.el.enchTitle, t('Enchants'));
    this.enchRows = new Map();
    for (const slot of SLOTS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key ench';
      row.dataset.slot = slot.id;
      row.innerHTML = `
        <span class="ore__name">${t(slot.name)}</span>
        <span class="key__what"></span>
        <span class="ore__have"><b></b> <i class="ico ico--sm ico--dust"></i></span>
        <span class="ore__smelt">${t('reroll')}</span>`;
      this.el.enchList.append(row);
      this.enchRows.set(slot.id, {
        slot, row,
        what: row.querySelector('.key__what'),
        cost: row.querySelector('b'),
      });
    }

    this.refreshOdds();
  }

  /**
   * Builds a WEB: one lattice, wires drawn under the nodes. Every tree in the
   * game goes through here -- talents, relics, souls and the four gathering
   * trees all have the same shape and the same rules, so they get the same
   * renderer.
   *
   * The nodes sit in a plain CSS grid so they stay crisp and tappable at any
   * size, and the wires are one SVG stretched over the same box with
   * `preserveAspectRatio="none"`. Both halves take their track sizes from the
   * SAME weights in the web's data, which is what makes a node's centre in
   * viewBox units land exactly on the node however the box is stretched.
   */
  buildWeb(host, web, kind) {
    const priced = kind === 'relic' || kind === 'soul';
    const wrap = document.createElement('div');
    wrap.className = 'web';
    wrap.style.gridTemplateColumns = web.colTracks;
    wrap.style.gridTemplateRows = web.rowTracks;
    // A four-wide web should not be stretched to the width of a seven-wide
    // one; the floor and the ceiling both scale with how much is in it.
    wrap.style.setProperty('--w', web.width);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'web__wires');
    svg.setAttribute('viewBox', `0 0 ${web.width} ${web.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const wires = [];
    for (const [a, b] of web.wires) {
      const from = web.center(a);
      const to = web.center(b);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', from.cx);
      line.setAttribute('y1', from.cy);
      line.setAttribute('x2', to.cx);
      line.setAttribute('y2', to.cy);
      // Without this the non-uniform stretch would squash every vertical wire
      // and fatten every horizontal one.
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      line.setAttribute('class', 'web__wire');
      svg.append(line);
      wires.push({ a: a.id, b: b.id, line });
    }
    this.wires.set(kind, wires);
    wrap.append(svg);

    // Lane names live in column 0, which holds no node.
    for (const lane of web.lanes) {
      const tag = document.createElement('span');
      tag.className = 'web__lane';
      tag.style.setProperty('--accent', lane.accent);
      tag.style.gridArea = `${lane.y + 1} / 1`;
      tag.textContent = lane.name;
      wrap.append(tag);
    }

    const accentOf = Object.fromEntries(web.lanes.map((l) => [l.id, l.accent]));
    for (const node of web.nodes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'node node--web'
        + (node.kind === 'keystone' ? ' node--key' : '')
        + (node.kind === 'cross' ? ' node--cross' : '');
      button.style.setProperty('--accent', accentOf[node.lane] ?? '#b9a17a');
      button.style.gridArea = `${node.y + 1} / ${node.x + 1}`;
      // The name is not printed on the node -- there is no room for it at this
      // size -- so it has to reach a screen reader some other way, and the
      // detail line under the web says it in full on hover or tap.
      button.setAttribute('aria-label', node.name);
      button.title = node.name;
      button.innerHTML = `
        <i class="ico ico--lg ico--${node.icon}"></i>
        <span class="node__rank">0/${node.max}</span>
        ${priced ? '<span class="node__cost"></span>' : ''}`;
      wrap.append(button);

      this.nodes.push({
        kind, web, node, button,
        rank: button.querySelector('.node__rank'),
        cost: button.querySelector('.node__cost'),
      });
    }

    host.append(wrap);
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
      this.sfx.play('buy');
      this.refreshShop(true);
      button.classList.remove('is-bought');
      void button.offsetWidth;
      button.classList.add('is-bought');
    });

    // Buying and reading a node share one tap: the click invests when it
    // can, and the line below explains what happened.
    for (const entry of this.nodes) {
      entry.button.addEventListener('click', () => {
        const bought = entry.kind === 'talent' ? state.buyTalent(entry.node)
          : entry.kind === 'relic' ? state.buyRelic(entry.node)
          : entry.kind === 'soul' ? state.buySoul(entry.node)
          : state.buySkillTalent(entry.kind, entry.node);
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

    el.cauldron.addEventListener('click', (e) => {
      const row = e.target.closest('[data-potion]');
      if (!row) return;
      const before = state.skills.alchemy.level;
      if (!state.brew(row.dataset.potion)) return;
      state.save();
      this.sfx.play('brew');
      this.toast({ text: t('{0} BREWED', row.dataset.potion.toUpperCase()) });
      if (state.skills.alchemy.level > before) {
        this.toast({ text: `ALCHEMY ${state.skills.alchemy.level}!` });
      }
      this.refreshSkills();
    });

    el.cosmosSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button && !button.disabled) this.showSky(button.dataset.sky);
    });
    const aimTelescope = (e) => {
      const card = e.target.closest('.pcard');
      if (!card || !state.observePlanet(card.dataset.body)) return;
      this.sfx.play('buy');
      this.refreshCosmos();
    };
    el.planetarium.addEventListener('click', aimTelescope);
    el.constellations.addEventListener('click', aimTelescope);

    el.kitchen.addEventListener('click', (e) => {
      const row = e.target.closest('[data-dish]');
      if (!row) return;
      const before = state.skills.cooking.level;
      if (!state.cook(row.dataset.dish)) return;
      state.save();
      this.sfx.play('brew');
      this.toast({ text: t('{0} PLATED', row.dataset.dish.toUpperCase()) });
      if (state.skills.cooking.level > before) {
        this.toast({ text: `COOKING ${state.skills.cooking.level}!` });
      }
      this.refreshSkills();
    });

    // The speed toggle. Cycles what the gates allow; a tap that cannot go
    // further says which reset opens the next notch.
    el.speed.addEventListener('click', () => {
      if (state.maxSpeed === 1) {
        this.toast({ text: t('x2 opens on your first rebirth') });
        return;
      }
      const was = state.speed;
      state.cycleSpeed();
      if (state.speed < was && state.maxSpeed < 3) {
        this.toast({ text: t('x3 opens on your first awakening') });
      }
      this.refreshSpeed();
    });

    el.keys.addEventListener('click', (e) => {
      const row = e.target.closest('.key');
      if (!row) return;
      const tier = Number(row.dataset.key);
      if (!state.forgeKey(tier)) return;
      state.save();
      this.sfx.play('jingle');
      this.toast({ text: t('{0} FORGED', KEYS[tier].name.toUpperCase()) });
      this.refreshSkills();
    });

    // --- the hall ---
    el.reserveSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      if (state.setReserve(Number(button.dataset.reserve))) this.refreshHall();
    });
    el.hallBless.addEventListener('click', () => {
      if (!state.buyBounty()) return;
      this.sfx.play('jingle');
      this.toast({ text: t('ANCESTRAL BOUNTY {0}', ['I', 'II', 'III', 'IV'][state.bounty - 1] ?? state.bounty) });
      this.refreshHall();
    });
    for (const r of this.spiritRows) {
      r.task.addEventListener('change', () => {
        if (!state.assignSpirit(r.i, r.task.value || null)) {
          this.refreshHall(true);   // refused: snap the select back
          return;
        }
        this.sfx.play('buy');
        this.refreshHall();   // the receipt under the select follows it
      });
      r.up.addEventListener('click', () => {
        if (!state.upgradeSpirit(r.i)) return;
        this.sfx.play('jingle');
        this.toast({ text: t('{0} RISES TO {1}', t(r.spirit.name).toUpperCase(), state.spiritLevel(r.i)) });
        this.refreshHall();
      });
    }

    el.pathList.addEventListener('click', (e) => {
      const row = e.target.closest('.pathrow');
      if (!row || !state.choosePath(row.dataset.path)) return;
      this.sfx.play('jingle');
      this.toast({ text: t('THE {0} PATH', t(this.pathRows.get(state.path).path.name).toUpperCase()) });
      this.refreshShop(true);
      this.refreshPaths();
    });

    el.quests.addEventListener('click', (e) => {
      const row = e.target.closest('.quest');
      const entry = row && this.questRows[Number(row.dataset.quest)]?.entry;
      if (!entry) return;
      const gems = state.claimQuest(entry.q, entry.weekly);
      if (!gems) return;
      this.sfx.play('jingle');
      this.toast({ text: t('+{0} GEM(S)', gems) });
      this.refreshQuests();
    });

    el.actBoss.addEventListener('click', () => { battle.tryBoss(); state.save(); });
    el.actEnter.addEventListener('click', () => {
      if (this._enterTier == null) return;
      if (battle.enterDungeon(this._enterTier)) state.save();
    });
    el.actBlood.addEventListener('click', () => {
      if (this._enterTier == null) return;
      if (battle.enterDungeon(this._enterTier, { bloody: true })) state.save();
    });
    el.actLeave.addEventListener('click', () => {
      if (battle.leaveDungeon()) state.save();
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
      if (!confirm(t('Refund every {0} point so you can respend them?', t(SKILLS[this.skill].name)))) return;
      state.respecSkill(this.skill);
      state.save();
      this.refreshSkills();
    });

    el.forgeList.addEventListener('click', (e) => {
      const button = e.target.closest('.slot');
      if (button) this.doForge(button.dataset.slot);
    });

    el.enchList.addEventListener('click', (e) => {
      const row = e.target.closest('.ench');
      if (!row) return;
      const mod = state.rerollEnchant(row.dataset.slot);
      if (!mod) return;
      state.save();
      this.sfx.play('forge');
      this.toast({ text: describeEnchant(mod).toUpperCase() });
      this.refreshForge();
    });

    el.petsList.addEventListener('click', (e) => {
      const row = e.target.closest('.pet');
      if (!row) return;
      // The walk button picks the road companion; the buffs never move.
      if (e.target.closest('.pet__walk')) {
        if (!state.setCompanion(row.dataset.pet)) return;
        battle.syncPets();
        this.sfx.play('buy');
        this.toast({ text: t('{0} WALKS WITH YOU', PET_BY_ID[row.dataset.pet].name.toUpperCase()) });
        this.refreshPets();
        return;
      }
      if (!e.target.closest('.pet__feed')) return;
      if (!state.feedPet(row.dataset.pet)) return;
      state.save();
      this.sfx.play('buy');
      this.refreshPets();
    });

    el.autoCraft.checked = state.autoCraftOn !== false;
    el.autoCraft.addEventListener('change', () => {
      state.autoCraftOn = el.autoCraft.checked;
      state.save();
    });

    el.respec.addEventListener('click', () => {
      if (!state.spentPoints) return;
      if (!confirm(t('Refund every skill point so you can respend them?'))) return;
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

    el.ascSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button) this.showAsc(button.dataset.asc);
    });

    el.presGo.addEventListener('click', () => {
      const gain = state.pendingRelics;
      if (gain <= 0) return;
      if (!confirm(t('Rebirth now pays {0} relic(s).\n\nYou lose stage, gold, upgrades, level and skill points. Confirm?', gain))) return;
      const spiritsBefore = state.spiritCount;
      battle.forfeitDungeon();
      state.prestige();
      battle.enterStage(state.startStage, { silent: true });
      this.refreshShop(true);
      this.refreshTrees(true);
      this.showTab('talents');
      this.showTree('relics');
      this.toast({
        text: state.prestiges === 1
          ? t('REBORN: THE FORGE IS OPEN')
          : t('REBORN: +{0} RELIC(S)', gain),
      });
      // The life just ended walks into the hall.
      if (state.spiritCount > spiritsBefore) {
        this.toast({ text: t('AN ANCESTOR WAKES') });
      }
      // The run just closed is exactly what the sprint board ranks.
      this.sendScore();
    });

    el.awkGo.addEventListener('click', () => {
      const gain = state.pendingSouls;
      if (gain <= 0) return;
      const lines = [
        t('Awakening pays {0} soul(s).\n\nYou lose everything Rebirth takes, PLUS relics, the relic tree, rebirths, dust and gear. Souls and the Skills tab survive.', gain),
      ];
      // Gear has always gone with an awakening and still does. What changed
      // is that a Mythic slot may have been paid for, and nobody should meet
      // that fact on the far side of the button. It counts Mythics rather
      // than purchases because the forge rolls them too, and claiming the
      // player bought something they earned would be its own small lie.
      const mythic = state.mythicWorn;
      if (mythic > 0) {
        lines.push(t('That includes {0} Mythic item(s): gems spent on Mythic Chests do not come back.', mythic));
      }
      lines.push(t('Confirm?'));
      if (!confirm(lines.join('\n\n'))) return;
      const spiritsBefore = state.spiritCount;
      battle.forfeitDungeon();
      state.awaken();
      if (state.spiritCount > spiritsBefore) {
        this.toast({ text: t('AN ANCESTOR WAKES') });
      }
      battle.enterStage(state.startStage, { silent: true });
      this.refreshShop(true);
      this.refreshForge();
      // Straight to the tree the souls just bought: it is the whole payout,
      // and it is one tab over from where the button was.
      this.showTab('talents');
      this.showTree('souls');
      this.toast({ text: t('AWAKENED: +{0} SOUL(S)', gain) });
      this.sendScore();
    });

    // --- the boards ---
    const openRanks = (open) => {
      el.ranks.hidden = !open;
      if (!open) return;
      // First open lands on the player's own league: the one they compete in.
      if (!this.league) this.league = state.spendTier;
      el.rankName.value = state.nick;
      this.sendScore();
      this.refreshRanks();
    };
    el.ranksBtn.addEventListener('click', () => openRanks(true));
    el.ranksClose.addEventListener('click', () => openRanks(false));
    el.ranks.addEventListener('click', (e) => { if (e.target === el.ranks) openRanks(false); });
    el.leagueSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      this.league = button.dataset.league;
      this.refreshRanks();
    });
    el.boardSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      this.board = button.dataset.board;
      this.refreshRanks();
    });
    el.rankSave.addEventListener('click', () => {
      const name = cleanName(el.rankName.value);
      if (!name) {
        this.toast({ text: t('PICK A CLEANER NAME') });
        return;
      }
      state.nick = name;
      state.save();
      el.rankName.value = name;
      this.sendScore();
      this.refreshRanks();
    });

    // --- gem shop ---
    const openGems = (open) => {
      el.gemShop.hidden = !open;
      if (open) this.refreshWares();
    };
    el.gemPill.addEventListener('click', () => openGems(true));
    el.gemClose.addEventListener('click', () => openGems(false));
    el.gemShop.addEventListener('click', (e) => {
      if (e.target === el.gemShop) openGems(false);
    });
    el.wares.addEventListener('click', (e) => {
      const row = e.target.closest('[data-ware]');
      if (row && !row.disabled) this.buyWare(row.dataset.ware);
    });

    // --- the store: the one door that asks for money ---
    const openStore = (open) => { el.storeModal.hidden = !open; };
    el.store.addEventListener('click', () => openStore(true));
    el.storeClose.addEventListener('click', () => openStore(false));
    el.storeModal.addEventListener('click', (e) => {
      if (e.target === el.storeModal) openStore(false);
    });
    el.packs.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pack]');
      if (row && !row.disabled) this.buyPack(row.dataset.pack);
    });

    // --- options ---
    el.optSfx.checked = !state.muted;
    el.optMusic.checked = !state.musicOff;
    el.optFloat.checked = !state.floatersOff;
    for (const button of el.langSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.lang === lang);
    }

    const openOptions = (open) => {
      el.optionsModal.hidden = !open;
      // The import pane never survives the modal: a stale paste sitting in
      // the box is a save replacement waiting for a misclick.
      el.importPane.hidden = true;
      el.importText.value = '';
    };
    el.options.addEventListener('click', () => openOptions(true));
    el.optionsClose.addEventListener('click', () => openOptions(false));
    // Tapping the backdrop closes; tapping the box does not.
    el.optionsModal.addEventListener('click', (e) => {
      if (e.target === el.optionsModal) openOptions(false);
    });

    el.optSfx.addEventListener('change', () => {
      state.muted = !el.optSfx.checked;
      state.save();
      if (!state.muted) this.sfx.play('buy');   // one tick so the ear knows
    });
    el.optMusic.addEventListener('change', () => {
      state.musicOff = !el.optMusic.checked;
      state.save();
    });
    el.optFloat.addEventListener('change', () => {
      state.floatersOff = !el.optFloat.checked;
      state.save();
    });
    el.langSwitch.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button || button.dataset.lang === lang) return;
      state.lang = button.dataset.lang;
      state.save();
      // Every string is read as the world is built, so the cleanest switch
      // is to rebuild the world: reload, now in the other language.
      this._skipUnloadSave = true;
      location.reload();
    });

    // Native prompt() and confirm() died here in alpha: Android webviews
    // swallow them whole (the button "does nothing") and phone clipboards
    // truncate a 3KB paste. The save now travels as a FILE plus clipboard
    // on the way out, and lands in a real textarea on the way in.
    el.exportSave.addEventListener('click', async () => {
      const text = state.exportSave();
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch { /* no secure context: the file below still carries it */ }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      link.download = 'little-rpg-save.txt';
      link.click();
      URL.revokeObjectURL(link.href);
      this.toast({ text: copied
        ? t('SAVE COPIED, AND SAVED AS A FILE') : t('SAVE SAVED AS A FILE') });
    });

    el.importSave.addEventListener('click', () => {
      el.importPane.hidden = !el.importPane.hidden;
      if (!el.importPane.hidden) el.importText.focus();
    });
    el.importFile.addEventListener('change', async () => {
      const file = el.importFile.files?.[0];
      if (!file) return;
      el.importText.value = (await file.text()).trim();
      el.importFile.value = '';
    });
    el.importGo.addEventListener('click', () => {
      const text = el.importText.value;
      if (!text.trim()) {
        this.toast({ text: t('PASTE A SAVE FIRST'), bad: true });
        return;
      }
      if (!GameState.importSave(text)) {
        this.toast({ text: t('THAT DID NOT READ AS A SAVE'), bad: true });
        return;
      }
      // Reloading boots from the imported save. The pagehide save would
      // clobber it with the old state, so it is the one save reload skips.
      this._skipUnloadSave = true;
      location.reload();
    });

    el.reset.addEventListener('click', () => {
      // The one button that takes the gem purse with it, bought gems and all,
      // and the only place in the game where that is true. Say so.
      if (!confirm(t('Erase EVERYTHING, souls, relics, prestige and your gems included? Gems do not come back, whether you cleared for them or paid for them.'))) return;
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
    if (name === 'cosmos') this.refreshCosmos();
    if (name === 'forge') this.refreshForge();
    if (name === 'hall') this.refreshHall(true);
    if (name === 'pets') this.refreshPets();
    if (name === 'prestige') this.refreshPrestige();
  }

  showTree(name) {
    this.tree = name;
    for (const button of this.el.treeSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.tree === name);
    }
    this.el.treeTalents.hidden = name !== 'talents';
    this.el.treeRelics.hidden = name !== 'relics';
    this.el.treeSouls.hidden = name !== 'souls';
    this.el.treePoints.classList.toggle('is-relic', name !== 'talents');
    this.el.respec.hidden = name !== 'talents';
    setText(this.el.treeDetail, 'Tap a node to invest.');
    this.refreshTrees(true);
  }

  /** Flips the Ascension tab between its reset layers and the feats. */
  showAsc(name) {
    this.asc = name;
    for (const button of this.el.ascSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.asc === name);
    }
    this.el.ascRebirth.hidden = name !== 'rebirth';
    this.el.ascAwaken.hidden = name !== 'awaken';
    this.el.ascFeats.hidden = name !== 'feats';
    this.refreshPrestige();
  }

  /** Three path cards on the Awaken pane; one free pick per awakening. */
  buildPaths() {
    setText(this.el.pathsTitle, t('Path'));
    this.pathRows = new Map();
    for (const path of PATHS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key pathrow';
      row.dataset.path = path.id;
      row.style.setProperty('--ore', path.accent);
      row.innerHTML = `
        <span class="ore__name"><i class="ico ico--sm ico--${path.icon}"></i> ${t(path.name)}</span>
        <span class="key__what">${describePath(path)}</span>
        <span class="ore__smelt"></span>`;
      this.el.pathList.append(row);
      this.pathRows.set(path.id, { path, row, action: row.querySelector('.ore__smelt') });
    }
  }

  refreshPaths() {
    const { state, el } = this;
    el.paths.hidden = state.awakens <= 0 && state.path === 'none';
    if (el.paths.hidden) return;
    for (const { path, row, action } of this.pathRows.values()) {
      const mine = state.path === path.id;
      row.classList.toggle('is-done', mine);
      row.disabled = mine || !state.canChoosePath;
      row.classList.toggle('can-smelt', !mine && state.canChoosePath);
      setText(action, mine ? t('yours') : state.canChoosePath ? t('follow') : t('locked'));
    }
    setText(el.pathNote, state.canChoosePath
      ? t('Pick a path: it is yours until your next awakening.')
      : t('The choice comes back with your next awakening.'));
  }

  buildFeats() {
    this.featRows = new Map();
    const frag = document.createDocumentFragment();
    for (const feat of FEATS) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="featlist__name">${feat.name}</span>
        <span class="featlist__desc">${t(feat.desc)} &middot; <b>${describeNode(feat, 1)}</b></span>
        <b class="featlist__mark"></b>`;
      frag.append(li);
      this.featRows.set(feat.id, { feat, li, mark: li.querySelector('.featlist__mark') });
    }
    this.el.featsList.append(frag);
  }

  refreshFeats() {
    const { state } = this;
    for (const { feat, li, mark } of this.featRows.values()) {
      const done = featDone(feat, state.stats);
      li.classList.toggle('is-done', done);
      setText(mark, done ? '\u2713' : `${fmt(Math.min(state.stats[feat.stat] ?? 0, feat.need))}/${fmt(feat.need)}`);
    }
  }

  /** Where a tree keeps its ranks. One map per kind, same shape. */
  ranksFor(kind) {
    if (kind === 'relic') return this.state.relicTalents;
    if (kind === 'soul') return this.state.soulTalents;
    if (SKILLS[kind]) return this.state.skillTalents[kind];
    return this.state.talents;
  }

  /** Explanation line for the node being touched. */
  describe(entry) {
    const { node, kind, web } = entry;
    const ranksOf = this.ranksFor(kind);
    const ranks = ranksOf[node.id] ?? 0;
    const locked = !webUnlocked(web, node, ranksOf);

    const say = SKILLS[kind] ? describeGatherNode : describeNode;
    const now = ranks > 0 ? t('now: {0}', say(node, ranks)) : t('no points yet');
    let line;
    if (locked) {
      // A keystone needs its approach FILLED, not merely started, and saying
      // "invest in X first" to somebody who already has nine points in X
      // reads as a bug rather than a requirement.
      if (node.kind === 'keystone') {
        const prev = webGate(web, node) ?? node;
        line = t('<b>{0}</b> is a keystone: fill <b>{1}</b> to {2}/{2} first.',
          node.name, prev.name, prev.max);
      } else {
        // In a web there is no single "previous node" -- name every door.
        const doors = web.neighbours[node.id].map((id) => web.byId[id].name).join(', ');
        line = t('<b>{0}</b> is locked: it opens next to <b>{1}</b>.', node.name, doors);
      }
    } else if (ranks >= node.max) {
      line = t('<b>{0}</b> is maxed. {1}.', node.name, say(node, ranks));
    } else {
      const price = kind === 'relic' ? t('{0} relic(s)', relicCost(node, ranks))
        : kind === 'soul' ? t('{0} soul(s)', soulCost(node, ranks))
        : t('1 point');
      line = t('<b>{0}</b> ({1}/{2}), {3}. Next point: <b>{4}</b> for {5}.',
        node.name, ranks, node.max, now, say(node, ranks + 1), price);
    }
    setHtml(SKILLS[kind] ? this.el.skillDetail : this.el.treeDetail, line);
  }

  toast({ text, bad = false }) {
    if (this.quiet) return;
    const el = this.el.toast;
    const now = performance.now();
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('is-bad', bad);
    // Restarting the pop-in animation needs a forced reflow, and at x3
    // speed toasts arrive faster than the animation runs -- profiling put
    // that reflow at a fifth of the simulation. Restart only when the
    // previous toast has had time to land; a machine-gun toast just swaps
    // its text, which is all anyone can read at that rate anyway.
    if (now - (this._toastAt ?? 0) > 250) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
    this._toastAt = now;
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
    const xpW = `${Math.min(100, (state.xp / need) * 100).toFixed(1)}%`;
    if (this._xpW !== xpW) { this._xpW = xpW; el.xpFill.style.width = xpW; }
    setText(el.xpText, `${fmt(state.xp)} / ${fmt(need)}`);

    const encounter = battle.nextEncounter();
    if (battle.inDungeon) {
      setText(el.stageName, battle.run.key.name);
      el.stageName.classList.toggle('is-boss', encounter === 'boss');
      setText(el.stageSub, `room ${Math.min(battle.run.room, DUNGEON.rooms)} / ${DUNGEON.rooms}`);
    } else {
      setText(el.stageName, t('Stage {0}', state.stage));
      el.stageName.classList.toggle('is-boss', encounter === 'boss');
      setText(el.stageSub, state.bossHeld ? 'boss waiting' : {
        boss: 'boss',
        elite: 'mini boss',
        mob: `${state.kills} / ${state.killsPerStage}`,
      }[encounter]);
    }
    setText(el.best, String(state.bestStage));
    setText(el.stageFoot, String(state.stage));

    const progressW = `${(battle.stageProgress * 100).toFixed(1)}%`;
    if (this._progressW !== progressW) {
      this._progressW = progressW;
      el.progress.style.width = progressW;
    }
    el.progress.classList.toggle('is-boss', encounter !== 'mob');

    const showTimer = battle.enemy?.isBoss === true;
    el.bossTimer.hidden = !showTimer;
    if (showTimer) setText(el.bossValue, Math.max(0, battle.bossTimer).toFixed(1));

    // Well Fed is a live combat state, so it lives in the HUD, not the tab.
    el.fed.hidden = !state.fed;
    if (state.fed) setText(el.fedTime, String(Math.ceil(state.fedTimer)));

    this.tickAutomation(dt);

    this._timer = (this._timer ?? 0) + dt;
    if (this._timer < 0.15) return;
    this._timer = 0;

    // Everything below runs at the 0.15s cadence. Pips, tab gates and the
    // arena buttons are can-I-afford scans across half the state, and no
    // question they answer needs answering sixty times a second.
    el.stagePrev.disabled = state.stage <= 1;
    el.stageNext.disabled = state.stage >= state.maxStage;

    // The purse appears the moment a dungeon has ever paid, and stays after
    // it is spent: `deepestKey` is the record that a clear happened.
    el.gemPill.hidden = state.gems <= 0 && (state.deepestKey ?? -1) < 0;
    if (!el.gemPill.hidden) setText(el.gemCount, fmt(state.gems));

    // "there is something to spend here" markers
    el.pipTalents.hidden = state.freePoints <= 0 && state.relics <= 0 && state.souls <= 0;
    // The soul tree only exists once an awakening has paid for it.
    el.treeTabSouls.hidden = state.souls <= 0 && state.soulsSpent <= 0;
    el.pipSouls.hidden = state.souls <= 0;
    el.pipSouls.classList.add('pip--gold');
    el.pipSkills.hidden = !SKILL_IDS.some((id) => state.skillFree(id) > 0)
      && !GATHER_IDS.some((id) => state.canBuyTool(id))
      && !KEYS.some((k) => state.canForgeKey(k.tier))
      && !POTIONS.some((p) => state.canBrew(p.id))
      && !DISHES.some((d) => state.canCook(d.id));
    el.pipSkills.classList.add('pip--gold');

    // Contextual action in the arena. A held boss outranks a key, because a
    // hold is a thing that just happened to you and a key is a plan.
    const inDungeon = battle.inDungeon;
    const bestKey = inDungeon ? null
      : [...KEYS].reverse().find((k) => (state.keys[k.tier] ?? 0) > 0) ?? null;
    el.actBoss.hidden = inDungeon || !state.bossHeld;
    el.actLeave.hidden = !inDungeon;
    el.actEnter.hidden = inDungeon || state.bossHeld || !bestKey;
    if (!el.actEnter.hidden) setText(el.actEnter, t('Open the {0}', bestKey.name));
    // The Bloodmoon needs the tier beaten once: a bet, not a first date.
    el.actBlood.hidden = el.actEnter.hidden || state.deepestKey < bestKey.tier;
    this._enterTier = bestKey ? bestKey.tier : null;
    el.arenaAct.hidden = el.actBoss.hidden && el.actLeave.hidden
      && el.actEnter.hidden && el.actBlood.hidden;

    // One chip for everything on a timer: brews from the cauldron, dishes
    // from the kitchen. They are the same kind of fact to the player.
    const brews = state.activePotions + state.activeDishes;
    el.brews.hidden = brews === 0;
    if (brews) setText(el.brewsN, String(brews));
    el.pipPrestige.hidden = state.pendingRelics <= 0 && state.pendingSouls <= 0;
    el.pipPrestige.classList.add('pip--gold');
    el.tabForge.hidden = !state.forgeUnlocked;
    el.tabCosmos.hidden = !state.cosmosOpen;
    // The sky nags only while the telescope sits idle with bodies left.
    const skyLeft = PLANETS.some((p) => !state.planetFound(p.id))
      || (state.starsOpen && CONSTELLATIONS.some((c) => !state.planetFound(c.id)));
    el.pipCosmos.hidden = !state.cosmosOpen || state.cosmos.target != null || !skyLeft;
    el.pipCosmos.classList.add('pip--gold');
    el.pipForge.hidden = !state.forgeUnlocked || !SLOTS.some((sl) => state.canForge(sl.id));
    el.pipForge.classList.add('pip--gold');
    // The hall opens on the first reset ever and never closes again. Its
    // pip nags for an idle spirit or an affordable rise, same spirit as
    // the forge's "you could do something here".
    el.tabHall.hidden = !state.hallOpen;
    let hallNag = state.canBuyBounty();
    for (let i = 0; i < state.spiritCount && !hallNag; i++) {
      if (!state.ancestors.assign[i] || state.canUpgradeSpirit(i)) hallNag = true;
    }
    el.pipHall.hidden = el.tabHall.hidden || !hallNag;
    el.pipHall.classList.add('pip--gold');
    el.pipPets.hidden = !PETS.some((p) => state.canFeedPet(p.id));
    el.pipPets.classList.add('pip--gold');

    // The Coin Cache is priced off a live rate, so an open shop keeps up.
    if (!el.gemShop.hidden) this.refreshWares();

    if (this.tab === 'upgrades') this.refreshShop();
    else if (this.tab === 'talents') this.refreshTrees();
    else if (this.tab === 'skills') this.refreshSkills();
    else if (this.tab === 'cosmos') this.refreshCosmos();
    else if (this.tab === 'forge') this.refreshForge();
    else if (this.tab === 'hall') this.refreshHall();
    else if (this.tab === 'pets') this.refreshPets();
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
      if (!statUnlocked(key, state) || state.isMaxed(key)) continue;
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

    for (const [gate, head] of this.shelves) {
      head.hidden = gate === 'awaken' ? state.awakens <= 0
        : state.prestiges <= 0 && state.awakens <= 0;
    }
    for (const row of this.rows.values()) {
      const key = row.up.key;
      const open = statUnlocked(key, state);
      if (row.li.hidden !== !open) row.li.hidden = !open;
      if (!open) continue;
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

      // "how much is missing" bar on rows you cannot afford yet. Written
      // only on change: at 21 rows a tick, same-value style writes were a
      // real slice of the slow-device frame budget.
      const width = can || maxed
        ? '0%'
        : `${Math.min(100, (state.gold / state.costOf(key)) * 100).toFixed(1)}%`;
      if (row.meterW !== width) {
        row.meterW = width;
        row.meter.style.width = width;
      }
    }

    this.refreshQuests(false);
    this.refreshStatbar();
    if (affordable > 0) {
      setText(el.shopHint, t('{0} upgrade(s) available', affordable));
    } else if (isFinite(cheapest) && state.goldPerSec > 0) {
      setText(el.shopHint, t('Next one in ~{0}', duration((cheapest - state.gold) / state.goldPerSec)));
    } else {
      setText(el.shopHint, t('Gather more gold'));
    }
  }

  // --- forge --------------------------------------------------------
  /** Forges a slot and reports what came out. */
  doForge(slotId, quiet = false) {
    const result = this.state.forge(slotId);
    if (!result) return null;
    this.state.save();

    if (this.quiet) return result;
    if (!quiet) this.sfx.play('forge');

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
      + `<dd style="color:${r.color}">${oddsPct(odds[i])}</dd></div>`).join(''));
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
      const mod = state.gearMods[entry.slot.id];
      setText(entry.effect, equipped == null
        ? 'nothing equipped'
        : describeGear(entry.slot, equipped) + (mod ? ` · ${describeEnchant(mod)}` : ''));
      setHtml(entry.cost, maxed
        ? 'maxed'
        : `<i class="ico ico--sm ico--dust"></i> ${cost}`);
    }

    // The reroll bench only lists slots with an affix to argue about.
    let enchanted = 0;
    for (const [slotId, entry] of this.enchRows) {
      const mod = state.gearMods[slotId];
      entry.row.hidden = !mod;
      if (!mod) continue;
      enchanted += 1;
      setText(entry.what, describeEnchant(mod));
      setText(entry.cost, String(state.enchantCost(slotId)));
      const can = state.canReroll(slotId);
      entry.row.disabled = !can;
      entry.row.classList.toggle('can-smelt', can);
    }
    el.enchWrap.hidden = enchanted === 0;

    // The set line: what the whole board pays now, or what it would.
    const worn = setRarity(state.gear);
    const bonus = worn != null ? SET_BONUS[worn] : null;
    setHtml(this.el.setStatus, bonus
      ? t('Set bonus, all {0}+: ', t(RARITIES[worn].name))
        + `<b>${t('+{0}% damage and health', Math.round(bonus.dmgMul * 100))}`
        + `${bonus.goldMul ? t(', +{0}% gold', Math.round(bonus.goldMul * 100)) : ''}</b>.`
      : worn != null
        ? t('Set bonus: raise every slot past Common to start it.')
        : t('Set bonus: fill every slot to start it.'));
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

    // Omniscience keeps its ledger through background catch-ups too: a
    // record set while you were not looking is still a record.
    state.tickOmni(dt);

    // The hall. The spirits' clock lives in state (they are game rules,
    // not UI convenience), but it ticks from here so they keep shopping
    // through background catch-ups, exactly like Herald and Anvil.
    const raised = state.tickAncestors(dt);
    if (raised > 0) {
      state.save();
      if (!this.quiet && this.tab === 'upgrades') this.refreshShop(true);
    }
  }

  /** One row per resource: raw, refined, and the ratio. A ledger, not a
   *  bench: the refinery works alone, so nothing here takes a tap. The
   *  alpha tester clicked a carp three times asking what it was for. */
  buildStock() {
    this.stockRows = new Map();
    for (const id of GATHER_IDS) {
      const skill = SKILLS[id];
      for (const resource of skill.resources) {
        const row = document.createElement('div');
        row.className = 'ore ore--ledger';
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

  /** One row per key: what it costs, what it opens, how many you hold. */
  buildKeys() {
    this.keyRows = new Map();
    for (const key of KEYS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key';
      row.dataset.key = String(key.tier);
      row.innerHTML = `
        <span class="ore__name">${key.name}</span>
        <span class="key__what">${t('stage {0}, {1} rooms', key.level, DUNGEON.rooms)}</span>
        <span class="ore__have"><b>0</b></span>
        <span class="ore__smelt">forge</span>`;
      this.el.keys.append(row);
      this.keyRows.set(key.tier, {
        key, row,
        have: row.querySelector('b'),
        what: row.querySelector('.key__what'),
        action: row.querySelector('.ore__smelt'),
      });
    }
  }

  buildCauldron() {
    this.brewRows = new Map();
    for (const potion of POTIONS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key';
      row.dataset.potion = potion.id;
      row.style.setProperty('--ore', potion.accent);
      row.innerHTML = `
        <span class="ore__name"><i class="ico ico--sm ico--${potion.icon}"></i> ${potion.name}</span>
        <span class="key__what">${t(potion.blurb)}</span>
        <span class="ore__have"><b></b></span>
        <span class="ore__smelt">brew</span>`;
      this.el.cauldron.append(row);
      this.brewRows.set(potion.id, {
        potion, row,
        what: row.querySelector('.key__what'),
        left: row.querySelector('b'),
        action: row.querySelector('.ore__smelt'),
      });
    }
  }

  /** The kitchen: one row per dish, built like the cauldron's bench. */
  buildKitchen() {
    this.dishRows = new Map();
    for (const dish of DISHES) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ore key';
      row.dataset.dish = dish.id;
      row.style.setProperty('--ore', dish.accent);
      row.innerHTML = `
        <span class="ore__name"><i class="ico ico--sm ico--${dish.icon}"></i> ${dish.name}</span>
        <span class="key__what">${t(dish.blurb)}</span>
        <span class="ore__have"><b></b></span>
        <span class="ore__smelt">${t('cook')}</span>`;
      this.el.kitchen.append(row);
      this.dishRows.set(dish.id, {
        dish, row,
        what: row.querySelector('.key__what'),
        left: row.querySelector('b'),
        action: row.querySelector('.ore__smelt'),
      });
    }
  }

  refreshKitchen() {
    const { state } = this;
    for (const { dish, row, what, left, action } of this.dishRows.values()) {
      const cost = state.dishCost(dish.id);
      const can = state.canCook(dish.id);
      const have = state.refined[cost.res.id] ?? 0;
      setHtml(what, `${t(dish.blurb)} &middot; `
        + `<i class="ico ico--sm ico--crate"></i>${fmt(have)}/${fmt(cost.amount)}`);
      const secs = state.dishes[dish.id] ?? 0;
      setText(left, secs > 0 ? duration(secs) : '');
      setText(action, can ? t('cook') : state.dishCapped(dish.id) ? t('full') : t('need'));
      row.disabled = !can;
      row.classList.toggle('can-smelt', can);
    }
  }

  /**
   * The observatory: each catalog is a sideways-scrolling row of card
   * portraits, joined O → O → O in discovery-ladder order. One click aims
   * the telescope; the card carries its own progress bar.
   */
  buildCosmos() {
    this.skyView = 'planetarium';
    this.bodyCards = new Map();
    const build = (host, list) => {
      list.forEach((body, i) => {
        if (i) {
          const link = document.createElement('span');
          link.className = 'pcard__link';
          link.textContent = '→';
          host.append(link);
        }
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pcard';
        card.dataset.body = body.id;
        card.style.setProperty('--accent', body.accent);
        card.innerHTML = `
          <i class="ico pbody ico--${body.icon}"></i>
          <span class="pcard__name">${t(body.name)}</span>
          <span class="pcard__what">${t(body.blurb)}</span>
          <span class="pcard__meter"><i></i></span>
          <span class="pcard__state"></span>`;
        host.append(card);
        this.bodyCards.set(body.id, {
          body, card,
          meter: card.querySelector('.pcard__meter i'),
          state: card.querySelector('.pcard__state'),
        });
      });
    };
    build(this.el.planetarium, PLANETS);
    build(this.el.constellations, CONSTELLATIONS);
    this.buildOmni();
  }

  /** The ledger: one board per pile, currencies first, then the lines. */
  buildOmni() {
    const frag = document.createDocumentFragment();
    this.omniRows = [];
    for (const rowDef of OMNI_ROWS) {
      const el = document.createElement('div');
      el.className = 'ore key omni-row';
      const name = rowDef.id.startsWith('ref:')
        ? `${rowDef.name} ${t(SKILLS[GATHER_IDS.find((id) =>
          SKILLS[id].resources.some((r) => `ref:${r.id}` === rowDef.id))].refinedName)}`
        : t(rowDef.name);
      el.innerHTML = `
        <span class="ore__name"><i class="ico ico--sm ico--${rowDef.icon}"></i> ${name}</span>
        <span class="key__what"></span>
        <span class="ore__have"><b></b></span>
        <span class="ore__smelt"></span>`;
      frag.append(el);
      this.omniRows.push({
        def: rowDef, el,
        what: el.querySelector('.key__what'),
        have: el.querySelector('b'),
        mark: el.querySelector('.ore__smelt'),
      });
    }
    this.el.omniList.append(frag);
  }

  refreshOmni() {
    const { state } = this;
    let total = 0;
    for (const r of this.omniRows) {
      const record = state.omni[r.def.id] ?? 0;
      const marks = omniTier(record, r.def.base);
      const next = omniNext(record, r.def.base);
      total += marks;
      // The lifetime tally, alone, wearing its name. What you HOLD lives
      // on the stock list; this number only ever grows.
      setHtml(r.have, `${fmt(record)} <span class="omni__tag">${t('total')}</span>`);
      setText(r.mark, marks ? `${marks}/${OMNI.cap}` : '');
      setHtml(r.what, marks
        ? `<b>${describeNode(r.def, marks)}</b>`
          + (next ? ` &middot; ${t('next mark at {0}', fmt(next))}` : ` &middot; ${t('at the summit')}`)
        : t('first mark at {0}', fmt(r.def.base)));
      r.el.classList.toggle('is-done', marks >= OMNI.cap);
      r.el.classList.toggle('can-smelt', marks > 0);
    }
    setText(this.el.planetsFound, String(total));
  }

  showSky(view) {
    this.skyView = view;
    for (const button of this.el.cosmosSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.sky === view);
    }
    this.el.planetarium.hidden = view !== 'planetarium';
    this.el.constellations.hidden = view !== 'constellations';
    this.el.omniList.hidden = view !== 'omni';
    this.refreshCosmos();
  }

  refreshCosmos() {
    const { state, el } = this;
    if (this.skyView === 'omni') {
      setHtml(el.cosmosDetail, t('Omniscience counts everything you have ever <b>gained</b>, lifetime. Spending never subtracts: the tally grows with your farm on its own, every mark of ten pays its own permanent buff, and the ledger survives every reset.'));
      this.refreshOmni();
      return;
    }
    const stars = this.skyView === 'constellations';
    const list = stars ? CONSTELLATIONS : PLANETS;
    const found = list.filter((b) => state.planetFound(b.id)).length;
    setText(el.planetsFound, `${found}/${list.length}`);
    // The stars stay dark until the first planet lands.
    el.skyStars.disabled = !state.starsOpen;
    setHtml(el.cosmosDetail, stars
      ? state.starsOpen
        ? t('The stars share the one telescope with the planets. A charted constellation is a <b>permanent buff</b> to your skills or your gear.')
        : t('Discover your <b>first planet</b> to read the stars.')
      : t('One body at a time, on game time. A discovered planet is yours forever, through rebirth and awakening, and <b>automates one thing</b> you were doing by hand.'));

    for (const { body, card, meter, state: stateEl } of this.bodyCards.values()) {
      const isFound = state.planetFound(body.id);
      const watching = state.cosmos.target === body.id;
      const locked = CONSTELLATION_BY_ID[body.id] != null && !state.starsOpen;
      const done = state.cosmos.progress[body.id] ?? 0;
      const need = observeTime(body);
      card.classList.toggle('is-done', isFound);
      card.classList.toggle('is-watching', watching);
      card.classList.toggle('is-locked', locked);
      card.disabled = isFound || locked;
      meter.style.width = isFound ? '100%' : `${Math.min(100, (done / need) * 100).toFixed(1)}%`;
      setText(stateEl, isFound ? '✓'
        : watching ? `${Math.floor((done / need) * 100)}% · ${duration(Math.max(1, need - done))}`
        : done > 0 ? `${t('observe')} · ${duration(need - done)}`
        : `${t('observe')} · ${duration(need)}`);
    }
  }

  refreshCauldron() {
    const { state } = this;
    for (const { potion, row, what, left, action } of this.brewRows.values()) {
      const cost = state.potionCost(potion.id);
      const can = state.canBrew(potion.id);
      const icon = cost.dust ? 'dust' : (potion.line === 'mining' ? 'bar' : 'plank');
      const have = cost.dust ? state.dust : (state.refined[cost.res.id] ?? 0);
      setHtml(what, `${t(potion.blurb)} &middot; `
        + `<i class="ico ico--sm ico--${icon}"></i>${fmt(have)}/${fmt(cost.amount)}`);
      const secs = state.potions[potion.id] ?? 0;
      setText(left, secs > 0 ? duration(secs) : '');
      // Three honest reasons to say no, each with its own word: banked to
      // the cap, the forge not built yet (dust exists before it does), or
      // simply short on the pile.
      const label = can ? t('brew')
        : state.brewCapped(potion.id) ? t('full')
        : cost.dust && !state.forgeUnlocked ? t('forge')
        : t('need');
      setText(action, label);
      row.disabled = !can;
      row.classList.toggle('can-smelt', can);
    }
  }

  // --- the boards ------------------------------------------------------
  /** Fire-and-forget submit of the live claim. Quiet on every failure. */
  sendScore() {
    if (!hasBackend()) return;
    const { state } = this;
    rememberMine(envelope(state, state.nick || 'Hero'));
    submit(state, state.nick || 'Hero');
  }

  async refreshRanks() {
    const { state, el } = this;
    for (const button of el.leagueSwitch.querySelectorAll('button')) {
      const league = button.dataset.league;
      button.classList.toggle('is-on', league === this.league);
      // The player's own league wears a mark: it is the one they play in.
      button.classList.toggle('is-mine', league === state.spendTier);
    }
    for (const button of el.boardSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-on', button.dataset.board === this.board);
    }
    setText(el.ranksNote, {
      pure: t('No real money and no gem-bought power. Gold and timeskips do not count.'),
      gilded: t('No real money, but power was bought with earned gems.'),
      patron: t('Real money was spent here. Thank you for keeping the lights on.'),
    }[this.league]);

    setHtml(el.rankList, `<div class="rank rank--empty">${t('reading the board...')}</div>`);
    const { rows, rank, stale } = await fetchBoard(this.league, this.board);
    // The modal may have moved on while the fetch ran; the late answer
    // must not paint over the newer question.
    if (el.ranks.hidden) return;

    const mine = deviceId();
    const value = (r) => (this.board === 'sprint' ? r.sprint : r.best_stage);
    const html = rows.length === 0
      ? `<div class="rank rank--empty">${t('nobody here yet, be the first')}</div>`
      : rows.map((r, i) => `
        <div class="rank${r.device === mine ? ' is-me' : ''}">
          <b>#${i + 1}</b>
          <span class="rank__name">${r.name.replace(/</g, '&lt;')}</span>
          <span class="rank__value">${t('stage {0}', fmt(value(r)))}</span>
        </div>`).join('');
    setHtml(el.rankList, html);

    const bits = [];
    if (rank > 100) bits.push(t('your rank: #{0}', fmt(rank)));
    if (stale) bits.push(t('offline, showing the last copy'));
    bits.push(t('Scores are claims sent by each device; absurd ones get pruned. Only your name and your best runs ever leave the game.'));
    setText(el.ranksFoot, bits.join(' · '));
  }

  // --- gem shop -------------------------------------------------------
  buildWares() {
    this.wareRows = new Map();
    for (const ware of GEM_WARES) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ware';
      row.dataset.ware = ware.id;
      row.innerHTML = `
        <i class="ico ico--lg ico--${ware.icon}"></i>
        <span>
          <span class="ware__name">${t(ware.name)}</span><br>
          <span class="ware__what">${t(ware.blurb)}</span>
        </span>
        <span class="ware__cost">${ware.cost}<i class="ico ico--sm ico--gem"></i></span>`;
      this.el.wares.append(row);
      this.wareRows.set(ware.id, { ware, row, what: row.querySelector('.ware__what') });
    }
  }

  /**
   * Prices every ware against what it would actually hand over right now.
   * A Coin Cache is worth whatever an hour of your best rate is worth, and
   * that number belongs on the button, not in a tooltip.
   */
  refreshWares() {
    const { state } = this;
    for (const { ware, row, what } of this.wareRows.values()) {
      const offer = state.gemOffer(ware.id);
      const inRun = ware.id === 'skip' && (this.battle.inDungeon || this._skipping);
      let line = t(ware.blurb);
      if (ware.id === 'coin') {
        line = offer.why === 'earn'
          ? t('earn some gold first, so there is a rate to pay out')
          : t('+{0} gold, an hour of your best rate', fmt(offer.amount));
      } else if (ware.id === 'chest') {
        const slot = state.weakestSlot();
        line = offer.why === 'forge' ? t('the forge opens on your first rebirth')
          : offer.why === 'full' ? t('every slot is already Mythic')
          : t('reforges your {0} to Mythic', t(SLOTS.find((s) => s.id === slot).name));
      } else if (ware.id === 'idol' && offer.why === 'owned') {
        line = t('yours already: the night pays in full');
      } else if (inRun) {
        // Two hours inside eight rooms would end the run and spend the rest
        // of the span back on the line, which is not what the button says.
        line = t('not while a key is running');
      }
      setHtml(what, line);
      row.disabled = !offer.ok || inRun;
      row.classList.toggle('can-buy', offer.ok && !inRun);
    }
  }

  /**
   * The store's own shelf, built from what it actually offered and priced in
   * its own strings. It is rebuilt rather than refreshed because it only
   * changes when the store answers, which happens once.
   */
  refreshPacks() {
    const { el } = this;
    const catalogue = this.billing.catalogue();
    // The button is always there -- it is where money lives, and a control
    // that exists only on some builds is one nobody learns. What changes is
    // what it opens: a shelf when a store answered, and a plain "this copy
    // sells nothing" when none did, which is the honest thing to tell
    // somebody who just tapped a shop.
    const has = catalogue.length > 0;
    el.storeEmpty.hidden = has;
    el.gemMore.hidden = !has;
    if (!has) { el.packs.replaceChildren(); return; }
    el.packs.replaceChildren(...catalogue.map((pack) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ware can-buy';
      row.dataset.pack = pack.sku;
      row.innerHTML = `
        <i class="ico ico--lg ico--gem"></i>
        <span>
          <span class="ware__name">${t(pack.name)}</span><br>
          <span class="ware__what">${t('{0} gems', pack.gems)}</span>
        </span>
        <span class="ware__cost">${pack.price}</span>`;
      return row;
    }));
  }

  /** A pack landed: say so, and let an open shop repaint its prices. */
  onGemsBought(gems) {
    this.state.save();
    this.toast({ text: t('+{0} GEM(S)', gems) });
    this.sfx.play('jingle');
    if (!this.el.gemShop.hidden) this.refreshWares();
  }

  /** Aria labels are the only text on the two HUD buttons. */
  labelTools() {
    this.el.store.setAttribute('aria-label', t('Store'));
    this.el.options.setAttribute('aria-label', t('Options'));
    this.el.speed.setAttribute('aria-label', t('Game speed'));
    this.refreshSpeed();
  }

  refreshSpeed() {
    setText(this.el.speed, `x${this.state.speed}`);
    this.el.speed.classList.toggle('is-on', this.state.speed > 1);
  }

  async buyPack(sku) {
    const result = await this.billing.buy(sku);
    if (result.ok) return;                    // onGemsBought already spoke
    if (result.reason === 'pending') {
      this.toast({ text: t('PAYMENT PENDING, GEMS ARRIVE WHEN IT CLEARS') });
    } else if (result.reason === 'failed') {
      this.toast({ text: t('THE PURCHASE DID NOT GO THROUGH'), bad: true });
    }
    // 'cancelled' and 'unavailable' say nothing: the player either backed
    // out on purpose or never had a store, and neither needs a banner.
  }

  /**
   * Buys a ware. The Hourglass is the one the state cannot settle alone: it
   * comes back as a span of seconds and the loop plays it out for real, so
   * the payout is a fight that happened rather than a number handed over.
   */
  async buyWare(id) {
    const { state } = this;
    // One at a time: a second Hourglass mid-skip would interleave two slice
    // loops over the same fight and bill for both.
    if (id === 'skip' && (this.battle.inDungeon || this._skipping)) return;
    const bought = state.buyGem(id);
    if (!bought) return;

    if (bought.id === 'coin') {
      this.toast({ text: t('+{0} GOLD', fmt(bought.gold)) });
      this.sfx.play('gold');
      this.refreshShop(true);
    } else if (bought.id === 'idol') {
      this.toast({ text: t('THE IDOL SHINES: OFFLINE PAYS IN FULL') });
      this.sfx.play('jingle');
    } else if (bought.id === 'chest') {
      const slot = SLOTS.find((s) => s.id === bought.slotId);
      const rarity = RARITIES[bought.rolled];
      this.toast({ text: `${t(rarity.name).toUpperCase()} ${t(slot.name).toUpperCase()}!` });
      this.sfx.play('forge');
      this.refreshForge();
    } else {
      // Awaited so a caller can know when the two hours have actually run.
      // The click handler does not care; the tests very much do.
      await this.runSkip(bought.seconds);
    }
    state.save();
    this.refreshWares();
  }

  /**
   * Runs the fight forward for real. `fastForward` is wired by main.js, which
   * owns the loop; without it the purchase would be a no-op, so the gems are
   * put back rather than swallowed.
   */
  async runSkip(seconds) {
    const { state } = this;
    if (!this.fastForward) {
      state.gems += WARE_BY_ID.skip.cost;
      return;
    }
    const before = { gold: state.gold, stage: state.stage, level: state.level };
    // Nobody can watch two hours go by, and every toast and sound along the
    // way would land at once. Quiet for the span, with a percentage in their
    // place, then one line saying what it came to.
    const wasQuiet = this.quiet;
    this.quiet = true;
    this._skipping = true;
    const done = await this.fastForward(seconds, (share) => {
      this.progress(t('skipping ahead... {0}%', Math.round(share * 100)));
    });
    this._skipping = false;
    this.quiet = wasQuiet;

    this.showAway({
      seconds: done,
      gold: state.gold - before.gold,
      stages: state.stage - before.stage,
      levels: state.level - before.level,
    });
    this.sfx.play('jingle');
    this.refreshShop(true);
    this.refreshWares();
  }

  /**
   * A toast that stays until something replaces it. The normal one hides
   * itself after 900ms and refuses to speak while `quiet`, and progress has
   * to do the opposite of both.
   */
  progress(text) {
    const el = this.el.toast;
    clearTimeout(this._toastTimer);
    el.hidden = false;
    el.classList.remove('is-bad');
    el.style.animation = 'none';
    el.textContent = text;
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
      t('Lv <b>{0}</b>, <b>{1}</b> pt', level.level, state.skillFree(id)));

    // The equip button IS the tradeoff, so it says which state it is in
    // rather than only what it would do. The two benchbound skills each
    // bring their own furniture: Smithing the workshop, Alchemy the cauldron.
    const gathers = skill.gathers === true;
    el.stock.hidden = !gathers;
    el.toolWrap.hidden = !gathers;
    el.workshop.hidden = id !== 'smithing';
    el.cauldronWrap.hidden = id !== 'alchemy';
    el.kitchenWrap.hidden = id !== 'cooking';
    el.skillEquip.hidden = !gathers;
    if (id === 'smithing') { this.refreshWorkshop(); return this.refreshSkillTree(id); }
    if (id === 'alchemy') { this.refreshCauldron(); return this.refreshSkillTree(id); }
    if (id === 'cooking') { this.refreshKitchen(); return this.refreshSkillTree(id); }

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
      setText(entry.raw, fmt(raw));
      setText(entry.refined, fmt(refined));
      // The ratio and the word: this row informs, the refinery works.
      setText(entry.action,
        `${t('auto')} ${state.refineCostFor(id, entry.resource)}:1`);
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
      + `<dd style="color:${r.color}">${oddsPct(odds[i])}</dd></div>`).join(''));
    setText(el.smithCost, mult(state.forgeDiscount));
    setText(el.smithRefine, mult(state.gatherBonus('smithing').refineAll));
    const back = Math.min(0.95, 0.3 + state.gatherBonus('smithing').scrapBack);
    setText(el.smithScrap, pct(back, 0));
    setText(el.smithFloor, RARITIES[floor].name);

    const known = new Set(state.knownKeys().map((k) => k.tier));
    for (const [tier, entry] of this.keyRows) {
      entry.row.hidden = !known.has(tier);
      if (entry.row.hidden) continue;
      const cost = state.keyCost(tier);
      const can = state.canForgeKey(tier);
      setText(entry.have, String(state.keys[tier] ?? 0));
      setHtml(entry.what, `${t('stage {0}', entry.key.level)} &middot; `
        + `<i class="ico ico--sm ico--bar"></i>${fmt(state.refined[cost.ore] ?? 0)}/${cost.bars} `
        + `<i class="ico ico--sm ico--plank"></i>${fmt(state.refined[cost.log] ?? 0)}/${cost.planks}`);
      setText(entry.action, can ? t('forge') : t('need'));
      entry.row.disabled = !can;
      entry.row.classList.toggle('can-smelt', can);
    }
  }

  refreshSkillTree(id) {
    const { state } = this;
    const ranksOf = state.skillTalents[id];
    for (const entry of this.nodes) {
      if (entry.kind !== id) continue;
      const ranks = ranksOf[entry.node.id] ?? 0;
      const canBuy = state.canBuySkillTalent(id, entry.node);
      entry.button.disabled = !canBuy;
      entry.button.classList.toggle('is-ranked', ranks > 0);
      entry.button.classList.toggle('is-full', ranks >= entry.node.max);
      entry.button.classList.toggle('is-locked', !webUnlocked(entry.web, entry.node, ranksOf));
      entry.button.classList.toggle('can-buy', canBuy);
      setText(entry.rank, `${ranks}/${entry.node.max}`);
    }
    this.refreshWires(id, ranksOf);
  }

  /**
   * Wires say where you have BEEN (both ends bought) and where you can go
   * next (one end bought). Without the second state a web looks like a maze
   * with the lights off.
   */
  refreshWires(kind, ranksOf) {
    for (const wire of this.wires.get(kind) ?? []) {
      const a = (ranksOf[wire.a] ?? 0) > 0;
      const b = (ranksOf[wire.b] ?? 0) > 0;
      wire.line.classList.toggle('is-on', a && b);
      wire.line.classList.toggle('is-open', (a || b) && !(a && b));
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
    // The three trees on this tab differ only in where the ranks live, what
    // pays for a point and how that price reads on the node.
    const KIND = { talents: 'talent', relics: 'relic', souls: 'soul' }[this.tree];
    const purse = {
      talent: t('<b>{0}</b> free point(s)', state.freePoints),
      relic: `<i class="ico ico--sm ico--relic"></i> ` + t('<b>{0}</b> relics', fmt(state.relics)),
      soul: `<i class="ico ico--sm ico--orb"></i> ` + t('<b>{0}</b> souls', fmt(state.souls)),
    }[KIND];
    setHtml(el.treePoints, purse);

    for (const entry of this.nodes) {
      if (SKILLS[entry.kind]) continue;  // its own tab, its own refresh
      if (entry.kind !== KIND) continue; // the other trees are hidden

      const ranksOf = this.ranksFor(entry.kind);
      const ranks = ranksOf[entry.node.id] ?? 0;
      const full = ranks >= entry.node.max;
      const canBuy = entry.kind === 'relic' ? state.canBuyRelic(entry.node)
        : entry.kind === 'soul' ? state.canBuySoul(entry.node)
        : state.canBuyTalent(entry.node);

      entry.button.disabled = !canBuy;
      entry.button.classList.toggle('is-ranked', ranks > 0);
      entry.button.classList.toggle('is-full', full);
      entry.button.classList.toggle('is-locked', !webUnlocked(entry.web, entry.node, ranksOf));
      entry.button.classList.toggle('can-buy', canBuy);
      setText(entry.rank, `${ranks}/${entry.node.max}`);
      if (entry.cost) {
        const price = entry.kind === 'soul'
          ? `${soulCost(entry.node, ranks)}s`
          : `${relicCost(entry.node, ranks)}r`;
        setText(entry.cost, full ? t('max') : price);
      }
    }

    this.refreshWires(KIND, this.ranksFor(KIND));
  }

  refreshPets() {
    const { state, el } = this;
    setText(el.petsCount, `${Object.keys(state.pets).length}/${PETS.length}`);

    for (const { pet, row, lvl, effect, feed } of this.petRows.values()) {
      const level = state.pets[pet.id] ?? 0;
      const tamed = level > 0;
      row.classList.toggle('is-locked', !tamed);

      if (!tamed) {
        // The objective is the row: what it does, and how to earn it.
        const u = pet.unlock;
        const progress = u.now ? ` (${fmt(u.now(state))}/${u.need})` : '';
        setText(lvl, t('locked'));
        setHtml(effect, `${t(pet.blurb)}. ${t('Tame: ')}<b>${t(u.desc)}</b>${progress}.`);
        feed.hidden = true;
        continue;
      }

      const { fish, cost } = state.petFood(pet.id);
      setText(lvl, t('Lv {0}', level));
      // Today's buff, then what the next meal buys: the whole decision.
      setHtml(effect, `${describeNode(pet, level)}${t(' · next: ')}<b>${describeNode(pet, level + 1)}</b>`);

      feed.hidden = false;
      feed.disabled = !state.canFeedPet(pet.id);
      // A refusal must explain itself: the alpha test's first bug report
      // was a full crate of MEALS and a button that "just would not go".
      // have/cost says it eats RAW fish, and how short the pond is.
      const held = state.raw[fish.id] ?? 0;
      setHtml(feed, feed.disabled
        ? `${t('Feed')} &middot; ${fmt(held)}/${fmt(cost)} <span class="pet__fish">${fish.name}</span>`
        : `${t('Feed')} &middot; ${fmt(cost)} <span class="pet__fish">${fish.name}</span>`);
      feed.classList.toggle('can-buy', !feed.disabled);
    }
    // The walker: one pet on the road, chosen here, buffs untouched.
    for (const { pet, walk } of this.petRows.values()) {
      const tamed = (state.pets[pet.id] ?? 0) > 0;
      const walking = state.companion === pet.id;
      walk.hidden = !tamed;
      walk.disabled = walking;
      walk.classList.toggle('is-on', walking);
      setText(walk, walking ? t('with you') : t('follow'));
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
    const next = nextRelicStage(relicsEarnedAt(state.maxStage, state.prestiges), state.prestiges);
    setText(el.presNext, isFinite(next) ? t('stage {0}', next) : t('n/a'));

    // The sprint: a record only a reset can improve, said next to the
    // button that does the resetting.
    setText(el.presSprint, state.sprintBest > 1
      ? t('stage {0} in 30min', state.sprintBest) : t('n/a'));
    setText(el.presClock, duration(state.runClock));

    el.presGainBox.classList.toggle('is-empty', gain <= 0);
    this.refreshPerks();

    el.presGo.disabled = gain <= 0;
    setText(el.presGo, gain > 0
      ? t('Rebirth for {0} relic(s)', gain)
      : t('Reach stage {0}', isFinite(next) ? next : PRESTIGE.minStage));

    // The soul purse only appears once awakening has entered the game.
    el.ascSouls.hidden = state.souls <= 0 && state.awakens <= 0;
    setText(el.soulsHave, fmt(state.souls));
    this.refreshAwaken();
    this.refreshFeats();
  }

  /** The Awaken side: what an ascension-wide reset would pay right now. */
  refreshAwaken() {
    const { state, el } = this;
    const gain = state.pendingSouls;
    const earned = state.cycleRelics;

    setText(el.awkGain, String(gain));
    setText(el.awkHave, fmt(state.souls));
    setText(el.awkCount, String(state.awakens));
    setText(el.awkSpent, fmt(state.soulsSpent));
    setText(el.awkProgress, fmt(earned));

    // Measured from what the cycle is already worth, like the relic readout.
    const next = nextSoulRelics(soulsEarnedAt(earned, state.awakens), state.awakens);
    setText(el.awkNext, isFinite(next) ? t('{0} relics', next) : t('n/a'));

    this.refreshPaths();
    el.awkGainBox.classList.toggle('is-empty', gain <= 0);
    el.pipAwaken.hidden = gain <= 0;
    el.awkGo.disabled = gain <= 0;
    setText(el.awkGo, gain > 0
      ? t('Awaken for {0} soul(s)', gain)
      : t('Earn {0} relics first', isFinite(next) ? next : AWAKEN.minRelics));
  }

  /** Lists what the relic tree already grants; hides itself when empty. */
  refreshPerks() {
    const { state, el } = this;
    const active = RELIC_WEB.nodes
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
  /** What a dungeon run paid. Shown on the way out, win or lose. */
  showReward({ relics, gems, dust, gold, won, cleared, first }) {
    const parts = [];
    if (relics > 0) parts.push(t('+{0} relic(s)', relics));
    if (gems > 0) parts.push(t('+{0} gem(s)', gems));
    if (dust > 0) parts.push(t('+{0} dust', fmt(dust)));
    if (gold > 0) parts.push(t('+{0} gold', fmt(gold)));
    if (!parts.length) return;
    // Deeper than the save has ever been is worth saying out loud: it is the
    // bounty that pays for the first proper visit to the shop.
    const head = !won ? t('{0} rooms', cleared) : first ? t('DEEPEST YET') : t('CLEARED');
    this.toast({ text: `${head}: ${parts.join(', ')}`, bad: !won });
  }

  showOffline({ seconds, gold }) {
    this.toast({ text: t('+{0} gold over {1}', fmt(gold), duration(seconds)) });
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
    if (gold > 0) parts.push(t('+{0} gold', fmt(gold)));
    if (stages > 0) parts.push(t('+{0} stages', stages));
    if (levels > 0) parts.push(t('+{0} levels', levels));
    if (!parts.length) return;
    this.toast({ text: `${parts.join(', ')} over ${duration(seconds)}` });
  }
}
