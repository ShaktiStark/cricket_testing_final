// ═══════════════════════════════════════════════════
// CONFIG — constants & API key store (FIXED)
// ═══════════════════════════════════════════════════
export const ADMIN_PASS = '26';
export const API_BASE = 'api/';

// 🔥 DEFAULT KEYS (fallback only)
const DEFAULT_KEYS = {
  series: '348661ac-cd21-4ef0-bea9-cf4231ee4a50',
  scorecard: '0685189e-95dc-4bc4-9f10-3ad78e854131',
  players: '9e24a977-bba8-43df-92d0-20c5f1ec8a4b',
};

// 🔥 ALWAYS GET LATEST KEY (NO CACHING)
export function getApiKey(type) {
  // We removed localStorage caching because it holds onto old keys!
  return DEFAULT_KEYS[type];
}

// 🔥 SET KEY (used when admin updates)
export function setApiKey(type, value) {
  // Disabled as UI box is removed
}

// 🔥 SAVE ALL KEYS (if using object)
export function saveApiKeys(keys) {
  // Disabled as UI box is removed
}

// ── API hit counter (100 / day limit) ──────────────
export function getHits() {
  const d = JSON.parse(localStorage.getItem('api_hits') || '{}');
  if (d.date === new Date().toDateString()) return d.hits || 0;
  return 0;
}

export function bumpHits(n) {
  const today = new Date().toDateString();
  const current = getHits();
  localStorage.setItem('api_hits', JSON.stringify({
    date: today,
    hits: current + n
  }));
}