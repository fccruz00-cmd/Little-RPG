// Idle-style number formatting: 1.2K, 340M, 5.07aa...

const SHORT = ['', 'K', 'M', 'B', 'T'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Alphabetic suffix used past trillions: aa, ab, ..., az, ba, ... */
function alphaSuffix(tier) {
  const i = tier - SHORT.length;
  const first = Math.floor(i / LETTERS.length);
  return LETTERS[first % LETTERS.length] + LETTERS[i % LETTERS.length];
}

/** `1234` becomes `"1.23K"`. Values below 1000 come out whole. */
export function fmt(value) {
  if (!isFinite(value)) return 'inf';
  const sign = value < 0 ? '-' : '';
  let n = Math.abs(value);
  if (n < 1000) return sign + (n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n));

  let tier = 0;
  while (n >= 1000) { n /= 1000; tier++; }
  const suffix = tier < SHORT.length ? SHORT[tier] : alphaSuffix(tier);
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return sign + n.toFixed(digits) + suffix;
}

/** Short percentage: `0.135` becomes `"13.5%"` */
export function pct(value, digits = 1) {
  return (value * 100).toFixed(digits).replace(/\.0$/, '') + '%';
}

/** Short multiplier: `1.24` becomes `"x1.24"` */
export function mult(value) {
  return 'x' + (value < 10 ? value.toFixed(2) : fmt(value));
}

/** Seconds to `"2h 13m"` / `"45s"` */
export function duration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
