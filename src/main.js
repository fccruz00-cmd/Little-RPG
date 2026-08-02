import { SPRITES } from './data/sprites.js';
import { allActorIds } from './data/enemies.js';
import { loadActors } from './engine/loader.js';
import { GameState } from './game/state.js';
import { Battle } from './game/battle.js';
import { Renderer } from './game/render.js';
import { UI } from './ui/ui.js';

const STEP = 1 / 60;      // passo fixo da simulação
const MAX_CATCHUP = 0.25; // no máximo 15 passos por quadro

async function boot() {
  const loading = document.getElementById('loading');
  const sheets = await loadActors(allActorIds(), SPRITES);

  const { state, offline } = GameState.load();
  const renderer = new Renderer(document.getElementById('stage'));
  const battle = new Battle(state, sheets);
  const ui = new UI(state, battle);

  // Handle de depuração: dá pra inspecionar/forçar estado pelo console.
  globalThis.__rpg = { state, battle, renderer, ui };

  const fitCanvas = () => { battle.viewWidth = renderer.resize(); };
  fitCanvas();
  addEventListener('resize', fitCanvas);
  addEventListener('orientationchange', () => setTimeout(fitCanvas, 120));

  if (offline) ui.showOffline(offline);

  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    const elapsed = Math.min((now - last) / 1000, MAX_CATCHUP);
    last = now;
    accumulator += elapsed;

    while (accumulator >= STEP) {
      battle.update(STEP);
      accumulator -= STEP;
    }

    state.refreshGoldRate(now);
    state.tickAutosave(elapsed);
    renderer.draw(battle, now / 1000);
    ui.update(elapsed);

    requestAnimationFrame(frame);
  }

  // Aba escondida: o rAF para. Ao voltar, credita o período como tempo ocioso.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      state.save();
      return;
    }
    last = performance.now();
    accumulator = 0;
    const gain = state.collectOffline(hiddenAt);
    if (gain) ui.showOffline(gain);
  });
  addEventListener('pagehide', () => state.save());

  loading.classList.add('is-done');
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  loading.textContent = 'não deu pra carregar os assets';
  loading.style.color = '#d9534f';
});
