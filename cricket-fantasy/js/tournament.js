// ═══════════════════════════════════════════════════
// TOURNAMENT — CRUD, home renders, card component
// ═══════════════════════════════════════════════════
import { state, getTournament }          from './state.js';
import { apiUpdateTournament,
         apiDeleteTournament,
         loadTournamentsFromServer }     from './api.js';
import { escHtml, norm, toast }          from './utils.js';
import { goPage }                        from './navigation.js';

// ── Shared update helper (optimistic + server sync) ──
export async function updateTournament(updated, silent = false) {
  const current = getTournament();
  updated = {
    ...current,
    ...updated,
    weeklyCaptains: updated.weeklyCaptains ?? current?.weeklyCaptains ?? {}
  };

  state.tournaments = state.tournaments.map(t =>
    t.id === updated.id ? updated : t
  );

  if (!silent && state.page === 'tournament' && !state.matchDetailOpen) {
    // renderTournamentContent is registered lazily to avoid circular imports
    if (window._renderTournamentContent) window._renderTournamentContent();
  }

  try {
    const res = await apiUpdateTournament(updated);
    if (!res || res.status !== 'success') throw new Error(res?.reason || 'Save failed');
    await loadTournamentsFromServer();
    if (!silent && state.page === 'tournament' && !state.matchDetailOpen) {
      if (window._renderTournamentContent) window._renderTournamentContent();
    }
  } catch (e) {
    console.error('DB save failed:', e);
    toast('❌ Save failed: ' + e.message, '#ef4444', '#fff', 4000);
  }
}

// ── User Home ─────────────────────────────────────
export function renderUserHome() {
  const grid = document.getElementById('user-tournaments-grid');
  grid.innerHTML = '';
  if (!state.tournaments.length) {
    grid.innerHTML = '<div class="ta-center txt-dim" style="padding:80px"><div style="font-size:48px;margin-bottom:16px">🏆</div>No tournaments yet. Check back soon!</div>';
    return;
  }
  state.tournaments.forEach(t => grid.appendChild(tournamentCard(t, () => openTournament(t.id))));
}

// ── Admin Home ────────────────────────────────────
export function renderAdminHome() {
  const grid = document.getElementById('admin-tournaments-grid');
  grid.innerHTML = '';
  if (!state.tournaments.length) {
    grid.innerHTML = `<div class="ta-center" style="padding:60px;grid-column:1/-1">
      <div style="font-size:52px;margin-bottom:16px">🏆</div>
      <div class="fw-800 txt-main" style="font-size:20px;margin-bottom:8px">No tournaments yet</div>
      <div class="txt-dim mb-24">Create one and upload your team Excel sheet</div>
      <button class="btn btn-primary" style="padding:14px 36px;font-size:15px" onclick="goNewTournament()">+ Create Tournament &amp; Upload Teams</button>
    </div>`;
    return;
  }
  state.tournaments.forEach(t => grid.appendChild(tournamentCard(t, () => openTournament(t.id))));
}

// ── Tournament card component ─────────────────────
export function tournamentCard(t, onClick) {
  const totalPlayers = (t.teams || []).reduce((s, x) => s + (x.players?.length || 0), 0);
  const el           = document.createElement('div');
  el.className       = 'card';
  el.style.cssText   = 'border:1px solid var(--bdra);cursor:pointer;transition:background .18s';
  el.onmouseenter    = () => el.style.background = 'var(--surfh)';
  el.onmouseleave    = () => el.style.background = '';
  el.onclick         = onClick;
  el.innerHTML = `
<div style="display:flex;justify-content:space-between;margin-bottom:12px">
  <span class="badge" style="background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.35);color:var(--ok)">
    ${escHtml(t.status || 'active')}
  </span>
  <span class="txt-dim fs-11">${(t.teams || []).length} teams</span>
</div>
<div class="fw-800 txt-main fs-17 mb-8">${escHtml(t.name)}</div>
<div class="txt-dim fs-12">${(t.matches || []).length} matches · ${totalPlayers} players</div>
${state.user === 'admin' ? `
  <div style="display:flex">
    <button class="btn mt-10" onclick="deleteTournamentClick(event,'${t.id}')"
      style="margin-left:auto;opacity:1;color:red;background:transparent;border:1px solid var(--bdr)">
      Delete
    </button>
  </div>` : ''}
`;
  return el;
}

export function openTournament(tId) {
  state.tId = tId;
  window._currentTab = 'leaderboard';
  goPage('tournament');
}

export function goNewTournament() {
  state.wiz = { tName: '', sid: '', parsedTeams: [], suggestions: {}, choices: {} };
  goPage('new-tournament');
}

export function deleteTournamentClick(e, id) {
  e.stopPropagation();
  deleteTournament(id);
}

export async function deleteTournament(id) {
  if (!confirm('Delete this tournament?')) return;
  try {
    const res = await apiDeleteTournament(id);
    if (res.status === 'success') {
      await loadTournamentsFromServer();
      renderAdminHome();
    } else {
      alert(res.reason || 'Delete failed');
    }
  } catch (e) {
    alert('Delete failed');
  }
}
