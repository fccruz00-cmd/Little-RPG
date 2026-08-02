// Tocador de animação de spritesheet horizontal.

export class Animator {
  /**
   * @param {Record<string, {image: HTMLImageElement, frames: number}>} sheets
   * @param {string} initial
   */
  constructor(sheets, initial = 'idle') {
    this.sheets = sheets;
    this.name = initial;
    this.time = 0;
    this.fps = 12;
    this.loop = true;
    this.done = false;
  }

  get sheet() {
    return this.sheets[this.name] ?? this.sheets.idle;
  }

  get frameCount() {
    return this.sheet.frames;
  }

  /** Índice do frame atual, já respeitando loop/one-shot. */
  get frame() {
    const i = Math.floor(this.time * this.fps);
    return this.loop ? i % this.frameCount : Math.min(i, this.frameCount - 1);
  }

  /** Progresso de 0 a 1 dentro da animação (útil pra saber quando o golpe sai). */
  get progress() {
    return Math.min(1, (this.time * this.fps) / this.frameCount);
  }

  /**
   * Troca de animação. Se já estiver tocando essa mesma, não reinicia —
   * a menos que `force` seja verdadeiro.
   */
  play(name, { fps = 12, loop = true, force = false } = {}) {
    if (this.name === name && !force) {
      this.fps = fps;
      this.loop = loop;
      return;
    }
    this.name = name;
    this.fps = fps;
    this.loop = loop;
    this.time = 0;
    this.done = false;
  }

  /**
   * Ajusta o fps pra animação inteira durar `seconds`.
   * Usado no ataque, que precisa acompanhar a cadência do personagem.
   */
  playTimed(name, seconds, { loop = false, force = false } = {}) {
    const sheet = this.sheets[name] ?? this.sheets.idle;
    this.play(name, { fps: sheet.frames / Math.max(0.05, seconds), loop, force });
  }

  update(dt) {
    this.time += dt;
    if (!this.loop && this.time * this.fps >= this.frameCount) this.done = true;
  }
}
