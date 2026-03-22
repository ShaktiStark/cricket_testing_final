// ═══════════════════════════════════════════════════
// CONFIG — constants & API key store
// ═══════════════════════════════════════════════════
export const ADMIN_PASS = '26';
export const API_BASE   = 'api/';

export const API_KEYS = {
  series:    localStorage.getItem('cric_key_series')    || '28147e70-c944-44b9-9aa1-b273d0daafd1',
  scorecard: localStorage.getItem('cric_key_scorecard') || '28147e70-c944-44b9-9aa1-b273d0daafd1',
  players:   localStorage.getItem('cric_key_players')   || '28147e70-c944-44b9-9aa1-b273d0daafd1',
};

export function saveApiKeys() {
  Object.entries(API_KEYS).forEach(([k, v]) =>
    localStorage.setItem('cric_key_' + k, v)
  );
}

// ── API hit counter (100 / day limit) ──────────────
export function getHits() {
  const d = JSON.parse(localStorage.getItem('api_hits') || '{}');
  if (d.date === new Date().toDateString()) return d.hits || 0;
  return 0;
}

export function bumpHits(n) {
  const today   = new Date().toDateString();
  const current = getHits();
  localStorage.setItem('api_hits', JSON.stringify({ date: today, hits: current + n }));
}
