// Formatação de números no estilo idle: 1.2K, 340M, 5.07aa…

const SHORT = ['', 'K', 'M', 'B', 'T'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Sufixo alfabético usado depois de trilhão: aa, ab, …, az, ba, … */
function alphaSuffix(tier) {
  const i = tier - SHORT.length;
  const first = Math.floor(i / LETTERS.length);
  return LETTERS[first % LETTERS.length] + LETTERS[i % LETTERS.length];
}

/** `1234` → `"1.23K"`. Valores abaixo de 1000 saem inteiros. */
export function fmt(value) {
  if (!isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  let n = Math.abs(value);
  if (n < 1000) return sign + (n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n));

  let tier = 0;
  while (n >= 1000) { n /= 1000; tier++; }
  const suffix = tier < SHORT.length ? SHORT[tier] : alphaSuffix(tier);
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return sign + n.toFixed(digits) + suffix;
}

/** Percentual curto: `0.135` → `"13.5%"` */
export function pct(value, digits = 1) {
  return (value * 100).toFixed(digits).replace(/\.0$/, '') + '%';
}

/** Multiplicador curto: `1.24` → `"x1.24"` */
export function mult(value) {
  return '×' + (value < 10 ? value.toFixed(2) : fmt(value));
}

/** Segundos → `"2h 13m"` / `"45s"` */
export function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
