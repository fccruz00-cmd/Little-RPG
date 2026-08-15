import { t } from '../i18n.js';
import { fmt } from '../format.js';

/**
 * Contracts: three a day and one a week, paid in gems.
 *
 * WHY THEY EXIST. Gems are the currency money can also buy, and rule 1 of
 * data/gems.js is that every gem is earnable. Before contracts, "earnable"
 * meant dungeons only -- real, but slow, and gone for the day once the keys
 * ran out. A daily board gives the free player a steady trickle and gives
 * the purse a reason to be looked at, which is what makes it worth anything.
 *
 * HOW PROGRESS IS MEASURED. Every contract reads one lifetime counter from
 * `state.stats` against a snapshot taken when the board rolled. The counters
 * only ever go up and nothing resets them -- not rebirth, not awakening --
 * so a contract can never lose progress, never double-count, and needs no
 * bookkeeping of its own on any kill site.
 *
 * HOW THE BOARD ROLLS. The day index picks the contracts DETERMINISTICALLY:
 * the same UTC day deals the same board to everyone, so there is nothing to
 * re-roll by clearing data or turning the clock. Turning the clock forward
 * does skip a day -- and skips that day's gems, which prices the exploit at
 * exactly what it pays.
 */

// The pool. `stat` is the lifetime counter, `need` the delta the contract
// asks for, `gems` what it pays. Needs are sized for one ordinary session:
// ~300 kills is under ten minutes at the measured kill rate, and the rarer
// counters ask for one or two of the thing rather than a grind.
export const DAILY_POOL = [
  { id: 'kills',   stat: 'kills',       need: 300, gems: 3, desc: 'defeat 300 enemies' },
  { id: 'bosses',  stat: 'bossKills',   need: 5,   gems: 4, desc: 'bring down 5 bosses' },
  { id: 'forges',  stat: 'forges',      need: 10,  gems: 4, desc: 'forge 10 times' },
  { id: 'refines', stat: 'refines',     need: 40,  gems: 3, desc: 'refine 40 units' },
  { id: 'feeds',   stat: 'feeds',       need: 3,   gems: 3, desc: 'feed your pets 3 times' },
  { id: 'brews',   stat: 'brews',       need: 2,   gems: 4, desc: 'brew 2 potions' },
  { id: 'cooks',   stat: 'cooks',       need: 2,   gems: 3, desc: 'cook 2 dishes' },
  { id: 'delve',   stat: 'dungeonWins', need: 1,   gems: 5, desc: 'clear a dungeon' },
];

/**
 * The weekly festival: one named world mood, one useful boon and one long
 * objective. This is deliberately the existing weekly contract grown into
 * content, not a second checklist competing for the same screen.
 *
 * `bonus` is a tiny whole-game nudge. It changes which week feels best for a
 * play style without making absence expensive: no exclusive item, no streak
 * that collapses, and next week's event is another boon rather than a loss.
 */
export const WEEKLY_EVENTS = [
  {
    id: 'golden_hunt', name: 'Golden Hunt', icon: 'gold',
    desc: 'Monsters carry extra coin this week.', boon: '+15% gold',
    bonus: { gold: 1.15 },
    quest: { id: 'wkills', stat: 'kills', need: 2500, gems: 20, desc: 'defeat 2,500 enemies' },
  },
  {
    id: 'heroes_rally', name: "Heroes' Rally", icon: 'damage',
    desc: 'Every strike lands harder this week.', boon: '+10% damage',
    bonus: { damage: 1.10 },
    quest: { id: 'wbosses', stat: 'bossKills', need: 40, gems: 20, desc: 'bring down 40 bosses' },
  },
  {
    id: 'scholars_road', name: "Scholar's Road", icon: 'book',
    desc: 'Every victory teaches more this week.', boon: '+15% experience',
    bonus: { xp: 1.15 },
    quest: { id: 'wdelve', stat: 'dungeonWins', need: 3, gems: 25, desc: 'clear 3 dungeons' },
  },
  {
    id: 'harvest_fair', name: 'Harvest Fair', icon: 'crate',
    desc: 'Every gathering trip yields more this week.', boon: '+12% gathering yield',
    bonus: { gather: 1.12 },
    quest: { id: 'wforges', stat: 'forges', need: 60, gems: 20, desc: 'forge 60 times' },
  },
];

export const DAILIES_PER_DAY = 3;

const DAY_MS = 86400000;

/** UTC day stamp. One number, no timezone to argue with. */
export function dayIndex(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

/** UTC week stamp, aligned to Monday (day 0 of Unix time is a Thursday). */
export function weekIndex(now = Date.now()) {
  return Math.floor((dayIndex(now) + 3) / 7);
}

/**
 * Deals `count` contracts from a pool for one period, deterministically.
 * A tiny LCG seeded by the period index walks the pool without repeats:
 * no Math.random, so every device sees the same board on the same day.
 */
export function dealFrom(pool, seed, count) {
  const picks = [];
  const left = pool.map((_, i) => i);
  let x = (seed * 2654435761) % 2147483647;
  for (let n = 0; n < count && left.length; n++) {
    x = (x * 48271) % 2147483647;
    picks.push(left.splice(x % left.length, 1)[0]);
  }
  return picks.map((i) => pool[i]);
}

export function dailyQuests(day) {
  return dealFrom(DAILY_POOL, day, DAILIES_PER_DAY);
}

export function weeklyQuest(week) {
  return weeklyEvent(week).quest;
}

/** Same festival for every player in the same UTC week. */
export function weeklyEvent(week) {
  const i = ((week % WEEKLY_EVENTS.length) + WEEKLY_EVENTS.length) % WEEKLY_EVENTS.length;
  return WEEKLY_EVENTS[i];
}

/** Progress line: "castle 40/300". Clamped so a done contract reads full. */
export function questProgress(quest, stats, snapshot) {
  const done = Math.max(0, (stats[quest.stat] ?? 0) - (snapshot[quest.stat] ?? 0));
  return Math.min(quest.need, done);
}

export function questDone(quest, stats, snapshot) {
  return questProgress(quest, stats, snapshot) >= quest.need;
}

export function describeQuest(quest, stats, snapshot) {
  return `${t(quest.desc)} (${fmt(questProgress(quest, stats, snapshot))}/${fmt(quest.need)})`;
}
