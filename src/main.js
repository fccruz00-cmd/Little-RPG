import { SPRITES } from './data/sprites.js';
import { allActorIds } from './data/enemies.js';
import { loadActors } from './engine/loader.js';
import { GameState } from './game/state.js';
import { Battle } from './game/battle.js';
import { Renderer } from './game/render.js';
import { UI } from './ui/ui.js';

const STEP = 1 / 60;      // fixed simulation step
const MAX_CATCHUP = 0.25; // at most 15 steps per frame

// --- background running ---------------------------------------------------
// requestAnimationFrame stops dead when the tab is hidden, so a timer takes
// over and fast-forwards the fight instead. Browsers throttle background
// timers to once a second, and to once a minute after five minutes, which is
// fine: each wake simulates the whole span since the last one.
// Stepping is cheap without a renderer attached: measured at roughly 0.07 ms
// per simulated second, so ten minutes of catch-up costs about 40 ms. The
// generous window means waking from a long freeze still gets played out
// properly instead of falling back to the flat idle payout.
const BG_PERIOD = 1000;      // ms between background ticks, before throttling
const BG_MAX_CATCHUP = 600;  // seconds of fight simulated in one wake
const BG_BUDGET_MS = 120;    // and no longer than this, whatever that costs
const BUDGET_CHECK = 240;    // steps between clock reads inside the loop

async function boot() {
  const loading = document.getElementById('loading');
  const sheets = await loadActors(allActorIds(), SPRITES);

  const { state, offline } = GameState.load();
  const renderer = new Renderer(document.getElementById('stage'));
  const battle = new Battle(state, sheets);
  const ui = new UI(state, battle);

  // Debug handle: lets you inspect and poke state from the console.
  globalThis.__rpg = { state, battle, renderer, ui };

  const fitCanvas = () => { battle.viewWidth = renderer.resize(); };
  fitCanvas();
  addEventListener('resize', fitCanvas);
  addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));

  if (offline) ui.showOffline(offline);

  let last = performance.now();
  let accumulator = 0;
  let rafId = 0;

  // Seconds of game time nobody simulated, because the browser froze the tab
  // or the machine slept. Paid out as idle gold once it is worth mentioning.
  let skipped = 0;

  function flushSkipped() {
    if (skipped < 60) return;
    const gain = state.bankIdle(skipped);
    skipped = 0;
    if (gain) ui.showOffline(gain);
  }

  /**
   * Runs the fight forward by `seconds` of game time and returns how much it
   * actually covered. The wall-clock budget is the safety valve: after a
   * laptop sleeps, `seconds` can be hours, and the caller banks whatever is
   * left over as idle gold instead of locking the thread trying to play it.
   */
  function advance(seconds, budgetMs) {
    const startedAt = performance.now();
    let left = seconds;
    let sinceCheck = 0;
    while (left >= STEP) {
      battle.update(STEP);
      state.clock += STEP;
      left -= STEP;
      sinceCheck += 1;
      if (sinceCheck >= BUDGET_CHECK) {
        sinceCheck = 0;
        if (performance.now() - startedAt > budgetMs) break;
      }
    }
    return seconds - left;
  }

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000);
    last = now;

    if (raw > MAX_CATCHUP) {
      // A visible tab can still be starved: a window sitting behind another,
      // or one the compositor thinks is occluded, gets its frames throttled
      // without ever firing visibilitychange. Nothing else would notice, so
      // catch the whole gap up here instead of clamping it away.
      accumulator = 0;
      skipped += raw - advance(raw, BG_BUDGET_MS);
      flushSkipped();
    } else {
      accumulator += raw;
      while (accumulator >= STEP) {
        battle.update(STEP);
        state.clock += STEP;
        accumulator -= STEP;
      }
    }

    const elapsed = Math.min(raw, MAX_CATCHUP);
    state.refreshGoldRate();
    state.tickAutosave(elapsed);
    renderer.draw(battle, now / 1000);
    ui.update(elapsed);

    rafId = requestAnimationFrame(frame);
  }

  // --- hidden tab -----------------------------------------------------
  // rAF stops, so a timer keeps the fight going. Whatever the timer cannot
  // cover, because the browser froze the tab or the machine slept, is banked
  // as idle gold on return.
  let bgTimer = 0;
  let bgLast = 0;
  let awayFrom = null;

  function bgTick() {
    const now = Date.now();
    const elapsed = (now - bgLast) / 1000;
    bgLast = now;
    if (elapsed <= 0) return;

    const wanted = Math.min(elapsed, BG_MAX_CATCHUP);
    skipped += elapsed - wanted;
    const done = advance(wanted, BG_BUDGET_MS);
    skipped += wanted - done;

    state.refreshGoldRate();
    // Automation is the one bit of game logic that lives in the UI. It has to
    // keep running here, otherwise Herald and Anvil quietly stop the moment
    // you look away, which is exactly when they matter.
    ui.tickAutomation(done);
    state.tickAutosave(done);
  }

  function goBackground() {
    if (bgTimer) return;
    state.save();
    bgLast = Date.now();
    skipped = 0;
    awayFrom = { at: bgLast, gold: state.gold, stage: state.stage, level: state.level };
    ui.quiet = true;
    bgTimer = setInterval(bgTick, BG_PERIOD);
  }

  function goForeground() {
    if (!bgTimer) return;
    clearInterval(bgTimer);
    bgTimer = 0;
    bgTick();                 // catch up on the span since the last wake
    state.bankIdle(skipped);  // and pay for whatever the timer never got to
    skipped = 0;              // that gold lands inside the summary below
    ui.quiet = false;

    if (awayFrom) {
      ui.showAway({
        seconds: (Date.now() - awayFrom.at) / 1000,
        gold: state.gold - awayFrom.gold,
        stages: state.stage - awayFrom.stage,
        levels: state.level - awayFrom.level,
      });
      awayFrom = null;
    }
    state.save();

    last = performance.now();
    accumulator = 0;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (ui._skipUnloadSave) return;
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      goBackground();
    } else {
      goForeground();
    }
  });
  addEventListener('pagehide', () => { if (!ui._skipUnloadSave) state.save(); });

  loading.classList.add('is-done');
  rafId = requestAnimationFrame(frame);
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; goBackground(); }
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  loading.textContent = 'could not load the assets';
  loading.style.color = '#d9534f';
});
