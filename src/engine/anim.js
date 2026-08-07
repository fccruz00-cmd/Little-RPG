// Player for horizontal spritesheet animations.

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

  /** Current frame index, honouring loop vs one-shot. */
  get frame() {
    const i = Math.floor(this.time * this.fps);
    return this.loop ? i % this.frameCount : Math.min(i, this.frameCount - 1);
  }

  /** Progress from 0 to 1 inside the animation (tells when a hit lands). */
  get progress() {
    return Math.min(1, (this.time * this.fps) / this.frameCount);
  }

  /**
   * Switches animation. Playing the same one again does not restart it
   * unless `force` is set.
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
   * Sets the fps so the whole animation lasts `seconds`.
   * Used by attacks, which must track the character's cadence.
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
