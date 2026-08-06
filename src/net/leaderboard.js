import { LEADERBOARD } from './config.js';
import { weekIndex } from '../data/quests.js';

// The leaderboard client: plain fetch against Supabase's REST surface, no
// SDK and no dependency, because the whole game is one file and a score
// table needs four requests, not a framework.
//
// THE TRUST MODEL, honestly: this is a fully client-side idle game, so a
// submitted score is a claim, not a proof. The server clamps, rate-limits
// and hardens leagues one way (supabase/schema.sql); the client behaves;
// and a determined cheat can still lie. The boards are for fun, and the
// three leagues keep the fun fair-ish: paying players, gem-power players
// and purists never share a ladder.
//
// OFFLINE FIRST. The game runs with no network forever. Submissions write
// a pending envelope to localStorage and flush when they can; a fetch that
// fails renders the last cached board with a "stale" mark instead of an
// error screen. No config, no calls: hasBackend() gates everything.

const DEVICE_KEY = 'little-rpg.device.v1';
const QUEUE_KEY = 'little-rpg.lbqueue.v1';
const CACHE_KEY = 'little-rpg.lbcache.v1';
const TIMEOUT_MS = 8000;

// Names: 2-16 chars of letters, digits, space and _.- (the server enforces
// the same floor). The blocklist is a courtesy comb for the obvious, in
// both languages the game speaks; the report button is the real filter.
const NAME_RE = /[^\p{L}\p{N} _.\-]/gu;
const BLOCKED = [
  'admin', 'moderador', 'moderator',
  'fuck', 'shit', 'cunt', 'nigg', 'bitch', 'porn',
  'merda', 'bosta', 'caralho', 'buceta', 'porra', 'foder', 'puta', 'pinto',
  'cacete', 'viado', 'cuzao', 'cuzão',
];

function cfg() {
  return globalThis.__LB_CONFIG ?? LEADERBOARD;
}

export function hasBackend() {
  const { url, anon } = cfg();
  return Boolean(url && anon);
}

/** A stable anonymous id for THIS device. Deliberately not in the save:
 *  an exported save opened on two phones is two devices, one row each. */
export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Trims a chosen name down to what both ends accept. */
export function cleanName(raw) {
  let name = String(raw ?? '').replace(NAME_RE, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const low = name.toLowerCase();
  if (BLOCKED.some((w) => low.includes(w))) name = '';
  return name.length >= 2 ? name : '';
}

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const { url, anon } = cfg();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** The envelope a submission travels in, built from live state. */
export function envelope(state, name) {
  return {
    p_device: deviceId(),
    p_name: name,
    p_league: state.spendTier,
    p_sprint: Math.max(0, Math.round(state.sprintBest)),
    p_best: Math.max(0, Math.round(state.bestStage)),
    p_week: weekIndex(),
  };
}

/**
 * Submits, or queues when it cannot. Returns 'sent', 'queued' or 'off'.
 * The queue holds ONE envelope -- the latest claim supersedes the rest,
 * because the server keeps maxima anyway.
 */
export async function submit(state, name) {
  if (!hasBackend() || !deviceId()) return 'off';
  const env = envelope(state, name);
  try {
    const res = await call('/rest/v1/rpc/submit_score', { method: 'POST', body: env });
    if (!res.ok) throw new Error(String(res.status));
    try { localStorage.removeItem(QUEUE_KEY); } catch { /* no queue to clear */ }
    return 'sent';
  } catch {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(env)); } catch { /* full */ }
    return 'queued';
  }
}

/** Sends whatever a failed session left behind. Quiet either way. */
export async function flushQueue() {
  if (!hasBackend()) return;
  let env;
  try {
    env = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? 'null');
  } catch {
    env = null;
  }
  if (!env) return;
  try {
    const res = await call('/rest/v1/rpc/submit_score', { method: 'POST', body: env });
    if (res.ok) localStorage.removeItem(QUEUE_KEY);
  } catch { /* still offline; the envelope keeps */ }
}

/**
 * One board: top rows plus this device's rank, cached for offline reads.
 * `board` is 'sprint' (this week's) or 'best' (all-time).
 * @returns {{rows, mine, rank, stale}}
 */
export async function fetchBoard(league, board) {
  const week = weekIndex();
  const filters = board === 'sprint'
    ? `league=eq.${league}&week=eq.${week}&order=sprint.desc,updated_at.asc`
    : `league=eq.${league}&order=best_stage.desc,updated_at.asc`;
  const key = `${league}:${board}`;
  try {
    const res = await call(`/rest/v1/scores?select=device,name,sprint,best_stage&${filters}&limit=100`);
    if (!res.ok) throw new Error(String(res.status));
    const rows = await res.json();
    const mine = deviceId();
    let rank = rows.findIndex((r) => r.device === mine) + 1;
    // Off the first page: count who beats us, the cheap way PostgREST offers.
    if (rank === 0 && rows.length === 100) rank = await rankOf(league, board, week);
    const out = { rows, rank, stale: false };
    cachePut(key, out);
    return out;
  } catch {
    const cached = cacheGet(key);
    return cached ? { ...cached, stale: true } : { rows: [], rank: 0, stale: true };
  }
}

/** Rank when outside the top page: 1 + how many rows sit above ours. */
async function rankOf(league, board, week) {
  const mine = cacheGet(`me`)?.env;
  if (!mine) return 0;
  const better = board === 'sprint'
    ? `league=eq.${league}&week=eq.${week}&sprint=gt.${mine.p_sprint}`
    : `league=eq.${league}&best_stage=gt.${mine.p_best}`;
  const res = await call(`/rest/v1/scores?select=device&${better}&limit=1`, {
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) return 0;
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total + 1 : 0;
}

/** Remembers the last envelope so rankOf can compare against something. */
export function rememberMine(env) {
  cachePut('me', { env });
}

function cachePut(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    all[key] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* cache is a courtesy */ }
}

function cacheGet(key) {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')[key] ?? null;
  } catch {
    return null;
  }
}
