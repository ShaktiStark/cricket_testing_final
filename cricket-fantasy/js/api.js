// ═══════════════════════════════════════════════════
// API — all server communication
// ═══════════════════════════════════════════════════
import { state }    from './state.js';
import { API_BASE } from './config.js';

// ── Load all tournaments from DB ──────────────────
export async function loadTournamentsFromServer() {
  try {
    const res = await fetch('api/get_tournaments.php');
    const j   = await res.json();

    if (j && j.status === 'success' && Array.isArray(j.data)) {
      state.tournaments = j.data.map(t => ({
        ...t,
        id: String(t.id),
        weeklyCaptains: t.weeklyCaptains || {},
        teams: (t.teams || []).map(tm => ({
          ...tm,
          id: String(tm.id),
          players: (tm.players || []).map(p => ({
            ...p,
            id:          String(p.id),
            matchPoints: p.matchPoints || {},
            cricketTeam: p.cricketTeam || ''
          }))
        }))
      }));
    } else {
      throw new Error(j?.reason || 'Server returned failure');
    }
  } catch (e) {
    console.error('loadTournamentsFromServer failed:', e.message);
    // Surface the error in the grid if we have no data
    if (state.page !== 'login' && !state.tournaments.length) {
      const grid =
        document.getElementById('user-tournaments-grid') ||
        document.getElementById('admin-tournaments-grid');
      if (grid) {
        grid.innerHTML = `<div class="alert alert-err" style="grid-column:1/-1">
          ❌ Could not connect to database: ${e.message}<br>
          <small>Check that XAMPP/MySQL is running and api/db.php credentials are correct.</small>
        </div>`;
      }
    }
  }
}

// ── CRUD wrappers ─────────────────────────────────
export async function apiSaveTournament(tournament) {
  const res = await fetch(`${API_BASE}save_tournament.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(tournament)
  });
  return res.json();
}

export async function apiUpdateTournament(tournament) {
  const res = await fetch(`${API_BASE}update_tournament.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(tournament)
  });
  return res.json();
}

export async function apiDeleteTournament(id) {
  const res = await fetch(`${API_BASE}delete_tournament.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id })
  });
  return res.json();
}

export async function apiManualPoints(payload) {
  const res = await fetch(`${API_BASE}manual_points.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  return res.json();
}

export async function apiFetchSeriesMatches(tournamentId, seriesId, apiKey) {
  const res = await fetch(`${API_BASE}fetch_series_matches.php`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tournament_id: tournamentId, series_id: seriesId, api_key: apiKey })
  });
  return res.json();
}

export async function apiNightlySync(tournamentId) {
  const res = await fetch(
    `${API_BASE}nightly_sync.php?secret=cricket_nightly_2026&tournament_id=${tournamentId}`
  );
  return res.json();
}
