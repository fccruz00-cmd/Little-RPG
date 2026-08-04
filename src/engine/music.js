// Generative background music. Not a loop: a slow chord pad wandering a
// small progression while sparse pentatonic notes fall over it at loose,
// random intervals. It never repeats exactly, which is the whole trick to
// not wearing a groove in the player's brain, and it is synthesized on the
// spot like the SFX: no files, no licences, nothing to load.
//
// The mood follows the descent. The overworld noodles in A minor, hell
// broods lower and slower in D minor, and the depths are barely music at
// all: long cold chords and a note falling every ten seconds or so.
//
// Loudness discipline: the pads peak well under the SFX, because music you
// notice is music that eventually bothers you. The footer toggle ramps the
// bus, so switching off mid-chord fades in a blink instead of clipping.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// [chords (midi note stacks), pluck scale, chord seconds, pluck gap seconds]
const MOODS = [
  { // overworld: Am F C G, gentle and unhurried
    chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]],
    scale: [69, 72, 74, 76, 79, 81, 84],
    chordLen: 8, gapMin: 2.0, gapVar: 3.5, pluckGain: 0.045,
  },
  { // hell: Dm Bb Gm A, lower, darker, a little slower
    chords: [[38, 45, 50, 53], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61]],
    scale: [62, 65, 67, 69, 70, 74],
    chordLen: 10, gapMin: 3.0, gapVar: 4.0, pluckGain: 0.04,
  },
  { // depths: Em Cmaj7 Am, long and cold, notes like water drips
    chords: [[40, 47, 52, 55], [36, 43, 52, 59], [45, 52, 57, 60]],
    scale: [64, 67, 71, 74, 76],
    chordLen: 13, gapMin: 6.0, gapVar: 6.0, pluckGain: 0.035,
  },
];

export class Music {
  /**
   * @param {{ctx: AudioContext|null, ensure: () => void}} sfx shares its context
   * @param {() => boolean} isOn read the live setting each tick
   */
  constructor(sfx, isOn) {
    this.sfx = sfx;
    this.isOn = isOn;
    this.mood = 0;
    this.bus = null;
    this.chordIdx = 0;
    this.nextChordAt = 0;
    this.nextPluckAt = 0;
    this.scheduled = 0;   // pads + plucks ever scheduled, for the tests
    // A slow scheduler is all this needs: everything is seconds long.
    this.timer = setInterval(() => this.tick(), 400);
  }

  ensure() {
    if (this.bus || !this.sfx.ctx) return;
    this.bus = this.sfx.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.sfx.ctx.destination);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    // Let the current chord finish; the next one arrives in the new key.
    this.chordIdx = 0;
  }

  tick() {
    const ctx = this.sfx.ctx;
    if (!ctx) return;                      // no gesture yet, nothing to do
    this.ensure();

    const t = ctx.currentTime;
    const on = this.isOn() && !document.hidden;

    // The toggle rides the bus: off is a fast fade, not a cut.
    const target = on ? 1 : 0;
    if (Math.abs(this.bus.gain.value - target) > 0.01) {
      this.bus.gain.setTargetAtTime(target, t, 0.15);
    }
    if (!on) return;

    // Coming back from a hidden tab, do not replay the backlog.
    if (this.nextChordAt < t - 1) this.nextChordAt = t + 0.1;
    if (this.nextPluckAt < t - 1) this.nextPluckAt = t + 1;

    const mood = MOODS[this.mood];
    if (t >= this.nextChordAt - 0.2) {
      const at = Math.max(t + 0.05, this.nextChordAt);
      this.pad(mood.chords[this.chordIdx % mood.chords.length], at, mood.chordLen);
      this.chordIdx += 1;
      this.nextChordAt = at + mood.chordLen;
    }
    if (t >= this.nextPluckAt) {
      const note = mood.scale[(Math.random() * mood.scale.length) | 0];
      this.pluck(midi(note), t + 0.05, mood.pluckGain);
      this.nextPluckAt = t + mood.gapMin + Math.random() * mood.gapVar;
    }
  }

  /**
   * One chord: each note is two triangles detuned a few cents (the shimmer
   * of a cheap chorus), swelling in over 3s and letting go over 4, so
   * consecutive chords crossfade on their own envelopes. A sine an octave
   * under the root carries the floor.
   */
  pad(notes, at, hold) {
    const ctx = this.sfx.ctx;
    const release = 4;
    const voice = (freq, gain, type = 'triangle') => {
      for (const cents of [-4, 4]) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = cents;
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(gain, at + 3);
        env.gain.setValueAtTime(gain, at + hold);
        env.gain.exponentialRampToValueAtTime(0.0001, at + hold + release);
        osc.connect(env).connect(this.bus);
        osc.start(at);
        osc.stop(at + hold + release + 0.1);
      }
    };
    for (const note of notes) voice(midi(note), 0.014);
    voice(midi(notes[0] - 12), 0.02, 'sine');
    this.scheduled += 1;
  }

  /** A single soft note, panned a little off-centre, decaying like a drip. */
  pluck(freq, at, gain) {
    const ctx = this.sfx.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    let head = env;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.5;
      env.connect(pan);
      head = pan;
    }
    osc.connect(env);
    head.connect(this.bus);
    osc.start(at);
    osc.stop(at + 1.8);
    this.scheduled += 1;
  }
}
