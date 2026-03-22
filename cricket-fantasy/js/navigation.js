// ═══════════════════════════════════════════════════
// NAVIGATION — page routing & topbar
// ═══════════════════════════════════════════════════
import { state, getTournament } from './state.js';
import { getHits, bumpHits }    from './config.js';

// Lazy imports to avoid circular deps — renderPage calls module renders.
// Each render module registers itself here.
const renderers = {};
export function registerRenderer(page, fn) { renderers[page] = fn; }

export function goPage(page, opts = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    el.classList.remove('fu');
    void el.offsetWidth;
    el.classList.add('fu');
  }

  const topbar     = document.getElementById('topbar');
  const backBtn    = document.getElementById('back-btn');
  const logoutBtn  = document.getElementById('logout-btn');
  const apiBadge   = document.getElementById('api-badge');
  const titleEl    = document.getElementById('page-title');
  const subEl      = document.getElementById('page-sub');

  if (page === 'login') {
    topbar.style.display = 'none';
  } else {
    topbar.style.display      = 'block';
    logoutBtn.style.display   = 'block';
    apiBadge.style.display    = state.user === 'admin' ? 'inline-block' : 'none';
    updateApiBadge();
  }

  const backMap = {
    'user-home':      null,
    'admin-home':     null,
    'new-tournament': 'admin-home',
    'resolve':        'new-tournament',
    'preview':        'new-tournament',
    'tournament':     state.user === 'admin' ? 'admin-home' : 'user-home',
  };
  const backTarget       = backMap[page];
  backBtn.style.display  = backTarget ? 'block' : 'none';
  backBtn.onclick        = () => goPage(backTarget);

  const titles = {
    'user-home':      ['Tournaments', null],
    'admin-home':     ['Admin Dashboard', null],
    'new-tournament': ['New Tournament', null],
    'resolve':        ['Verify Player Names', `${Object.keys(state.wiz.suggestions).length} name(s) need confirmation`],
    'preview':        ['Review & Create', `${state.wiz.parsedTeams.length} teams · ${state.wiz.parsedTeams.reduce((s, t) => s + t.players.length, 0)} players`],
    'tournament':     [getTournament()?.name || '', `${getTournament()?.startDate || ''} · ${(getTournament()?.teams || []).length} teams`],
  };
  const [title, sub] = titles[page] || ['', null];
  titleEl.textContent      = title;
  subEl.textContent        = sub || '';
  subEl.style.display      = sub ? 'block' : 'none';

  state.page = page;

  if (renderers[page]) renderers[page]();
}

export function navBack() {
  const backMap = {
    'new-tournament': 'admin-home',
    'resolve':        'new-tournament',
    'preview':        'new-tournament',
    'tournament':     state.user === 'admin' ? 'admin-home' : 'user-home',
  };
  const target = backMap[state.page];
  if (target) goPage(target);
}

export function updateApiBadge() {
  const badge = document.getElementById('api-badge');
  if (!badge) return;
  const hits = getHits();
  badge.textContent        = `API ${hits}/100`;
  badge.style.background   = hits >= 90 ? 'rgba(248,113,113,.2)'  : 'rgba(56,189,248,.15)';
  badge.style.border       = `1px solid ${hits >= 90 ? 'rgba(248,113,113,.4)' : 'rgba(56,189,248,.4)'}`;
  badge.style.color        = hits >= 90 ? '#f87171' : '#38bdf8';
}

export function switchTab(tab) {
  window._currentTab = tab;
  ['leaderboard', 'matches', 'manage'].forEach(k => {
    const content = document.getElementById('tab-' + k);
    const btn     = document.getElementById('tab-btn-' + k);
    if (content) content.style.display = k === tab ? 'block' : 'none';
    if (btn)     btn.classList.toggle('active', k === tab);
  });
}
