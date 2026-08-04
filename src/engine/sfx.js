// Synthesized retro sound. No samples, no files, no licences: every effect
// is an oscillator envelope or a pinch of noise, in the same spirit as the
// pixel art. The whole kit costs nothing to ship and weighs nothing to load.
//
// Browsers only allow audio after a user gesture, so the context is created
// lazily on the first pointer/key event. Rapid-fire effects (hits, coins)
// are throttled per name: at nine swings a second, sound that fires on
// every swing is noise in both senses.

const THROTTLE = {
  hit: 70, crit: 110, gold: 90, buy: 60, hurt: 120,
  default: 150,
};

export class SFX {
  /** @param {() => boolean} isMuted read the live setting each play */
  constructor(isMuted) {
    this.isMuted = isMuted;
    this.ctx = null;
    this.master = null;
    this.last = {};
    // The unlock: first gesture anywhere builds the context.
    const unlock = () => {
      this.ensure();
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  /** One oscillator with a pitch slide and a decay envelope. */
  tone({ type = 'square', from = 440, to = from, at = 0, dur = 0.08, gain = 0.1 }) {
    const { ctx } = this;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of white noise, for clinks and crunches. */
  noise({ at = 0, dur = 0.05, gain = 0.08, low = false }) {
    const { ctx } = this;
    const t0 = ctx.currentTime + at;
    const frames = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let head = src;
    if (low) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      src.connect(filter);
      head = filter;
    }
    head.connect(env).connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (this.isMuted() || document.hidden) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = performance.now();
    const gap = THROTTLE[name] ?? THROTTLE.default;
    if (now - (this.last[name] ?? 0) < gap) return;
    this.last[name] = now;

    const jitter = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'hit':
        this.tone({ type: 'square', from: 220 * jitter, to: 170, dur: 0.05, gain: 0.07 });
        break;
      case 'crit':
        this.tone({ type: 'square', from: 460 * jitter, to: 240, dur: 0.09, gain: 0.1 });
        this.noise({ dur: 0.04, gain: 0.05 });
        break;
      case 'gold':
        this.tone({ type: 'sine', from: 880, dur: 0.05, gain: 0.06 });
        this.tone({ type: 'sine', from: 1320, at: 0.045, dur: 0.06, gain: 0.05 });
        break;
      case 'hurt':
        this.tone({ type: 'triangle', from: 160 * jitter, to: 90, dur: 0.08, gain: 0.09 });
        break;
      case 'down':
        this.tone({ type: 'sawtooth', from: 220, to: 55, dur: 0.35, gain: 0.12 });
        break;
      case 'level':
        for (const [i, f] of [523, 659, 784].entries()) {
          this.tone({ type: 'square', from: f, at: i * 0.07, dur: 0.09, gain: 0.08 });
        }
        break;
      case 'boss':
        this.tone({ type: 'sawtooth', from: 82, to: 60, dur: 0.5, gain: 0.14 });
        this.tone({ type: 'sawtooth', from: 110, to: 82, at: 0.08, dur: 0.42, gain: 0.08 });
        break;
      case 'bossdown':
        for (const [i, f] of [392, 523, 659, 784].entries()) {
          this.tone({ type: 'square', from: f, at: i * 0.08, dur: 0.12, gain: 0.09 });
        }
        break;
      case 'forge':
        this.noise({ dur: 0.03, gain: 0.09 });
        this.tone({ type: 'triangle', from: 1300 * jitter, to: 500, at: 0.01, dur: 0.11, gain: 0.08 });
        break;
      case 'brew':
        this.tone({ type: 'sine', from: 280, to: 460, dur: 0.16, gain: 0.08 });
        this.tone({ type: 'sine', from: 340, to: 560, at: 0.1, dur: 0.14, gain: 0.06 });
        break;
      case 'jingle':   // tames, feats, forged keys: little victories
        for (const [i, f] of [659, 880, 1047].entries()) {
          this.tone({ type: 'square', from: f, at: i * 0.06, dur: 0.09, gain: 0.07 });
        }
        break;
      case 'buy':
        this.tone({ type: 'square', from: 700, to: 640, dur: 0.03, gain: 0.05 });
        break;
      case 'chest':
        for (const [i, f] of [988, 1319, 1760].entries()) {
          this.tone({ type: 'sine', from: f, at: i * 0.05, dur: 0.07, gain: 0.06 });
        }
        break;
      case 'gather':
        this.noise({ dur: 0.05, gain: 0.05, low: true });
        break;
      default:
        break;
    }
  }
}
