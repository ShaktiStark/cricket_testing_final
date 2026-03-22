// ═══════════════════════════════════════════════════
// WEEK — ISO week helpers (Mon-Sun windows)
// ═══════════════════════════════════════════════════

export function getWeekMonday(date) {
  const d   = new Date(date);
  const day = d.getDay();                         // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getWeekSunday(date) {
  const mon = new Date(getWeekMonday(date));
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}

/** Return the Monday-date key (YYYY-MM-DD) for any date. */
export function weekKey(date) {
  return getWeekMonday(date);
}

/** Human-readable label "DD Mon – DD Mon" for a week key. */
export function weekLabel(key) {
  if (!key) return '';
  const sun = getWeekSunday(key);
  const fmt = d => {
    const [, m, dd] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dd} ${months[+m - 1]}`;
  };
  return `${fmt(key)} – ${fmt(sun)}`;
}

/** ISO week number for a given date. */
export function getISOWeekNum(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y) / 86400000) + 1) / 7);
}

/** Convert a <input type="week"> value "YYYY-Www" to a Monday YYYY-MM-DD key. */
export function weekKeyFromInput(val) {
  if (!val) return weekKey(new Date());
  const [yr, ww] = val.split('-W');
  const year = parseInt(yr), week = parseInt(ww);
  const jan4  = new Date(year, 0, 4);
  const startW1 = new Date(jan4);
  startW1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);
  const mon = new Date(startW1);
  mon.setDate(startW1.getDate() + (week - 1) * 7);
  return mon.toISOString().slice(0, 10);
}

/** Return the week-key for a match (looked up by match date). */
export function getWeekKeyFromMatch(matchId, tournament) {
  const match = (tournament.matches || []).find(m => m.id === matchId);
  if (!match || !match.date) return null;
  return weekKey(new Date(match.date));
}
