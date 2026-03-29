// ═══════════════════════════════════════════════════
// MANAGE — admin tab: scores, manual, injury, captain
// ═══════════════════════════════════════════════════
import { state, getTournament }          from './state.js';
import { getApiKey, setApiKey, getHits, bumpHits }   from './config.js';
import { apiManualPoints,
         apiFetchSeriesMatches,
         apiNightlySync,
         loadTournamentsFromServer,apiUpdateTournament }     from './api.js';
import { escHtml, escAttr, norm, toast, makeId } from './utils.js';
import { normalizeScorecard }            from './utils.js';
import { applyMatch }                    from './scoring.js';
import { updateTournament }              from './tournament.js';
import { renderLeaderboard, playerTotalWithCap }             from './leaderboard.js';
import { renderMatchesList, renderFantasyPoints } from './matches.js';
import { renderSubCaptain }              from './captain.js';

// ── Sub-tab switcher ──────────────────────────────
let currentSubTab = 'scores';

export function switchSubTab(sub) {
  currentSubTab = sub;
  const t = getTournament();
  ['upload', 'scores', 'captain', 'injury', 'manual'].forEach(k => {
    const el  = document.getElementById('sub-' + k);
    const btn = document.getElementById('sub-btn-' + k);
    if (el)  el.style.display = k === sub ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', k === sub);
  });
  if (sub === 'manual') renderSubManual(t);
}

// ── Top-level manage renderer ─────────────────────
export function renderManage(t) {
  renderSubScores(t);
  renderSubInjury(t);
  renderSubCaptain(t);
}

// ══════════════════════════════════════════════════
// SECTION: Scores (fetch schedule + scorecards)
// ══════════════════════════════════════════════════
export function renderSubScores(t) {
  const el       = document.getElementById('sub-scores');
  const hitsLeft = 100 - getHits();
  const allMatches = t.matches || [];
  const scored     = allMatches.filter(m => m.isScored).length;
  const unscored   = allMatches.filter(m => !m.isScored && m.status === 'completed').length;

  const keyCard = '';

  el.innerHTML = `
    <div class="card mb-14">
      <div class="lbl">📋 Step 1 — Fetch Match Schedule</div>
      <div class="txt-dim fs-12" style="margin:8px 0 14px;line-height:1.6">
        Pulls the full match list from CricAPI series_info (<b>1 hit</b>) and stores
        only <b>new matches</b>. Duplicate match IDs are ignored.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="scores-sid" class="inp flex-1" placeholder="Paste CricAPI Series ID" value="${escHtml(t.seriesId || '')}"/>
        <button class="btn btn-primary" onclick="fetchSeriesMatches()" style="white-space:nowrap">📥 Fetch Schedule</button>
      </div>
      <div class="txt-dim fs-12 mb-8">Quick pick:</div>
      ${[
        ['87c62aac-bc3c-4738-ab93-19da0690488f', 'IPL 2026'],
      ].map(([id, nm]) => `
        <button class="w100 ta-left" style="background:none;border:1px solid var(--bdr);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px;margin-bottom:6px;color:var(--txt)"
          onmouseover="this.style.borderColor='var(--bdra)'" onmouseout="this.style.borderColor='var(--bdr)'"
          onclick="document.getElementById('scores-sid').value='${id}'">
          <b>${nm}</b> <span class="txt-dim fs-11" style="font-family:monospace">${id.slice(0, 10)}…</span>
        </button>`).join('')}
    </div>

    <div class="card mb-14">
      <div class="lbl">⚡ Step 2 — Score Today's Matches</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0 14px">
        <div class="fs-12 txt-dim">
          Total: <b>${allMatches.length}</b> · Scored: <b style="color:var(--ok)">${scored}</b> · Unscored: <b style="color:var(--warn)">${unscored}</b>
        </div>
        <span class="badge" style="background:${hitsLeft < 20 ? 'rgba(248,113,113,.2)' : 'rgba(52,211,153,.15)'};border:1px solid ${hitsLeft < 20 ? 'rgba(248,113,113,.4)' : 'rgba(52,211,153,.35)'};color:${hitsLeft < 20 ? 'var(--err)' : 'var(--ok)'}">
          ${hitsLeft}/100 hits left today
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-success" onclick="fetchScores()" style="flex:1;min-width:160px">⚡ Sync Scorecards Now</button>
        <button class="btn" onclick="triggerNightlySync()" style="flex:1;min-width:160px;background:var(--surf1)">🌙 Run Nightly Job</button>
      </div>
      <div class="fs-11 txt-dim" style="margin-top:10px">
        🕙 Nightly cron: <code>20 18 * * * php /path/to/api/nightly_sync.php</code> (18:20 UTC = 23:50 IST)
      </div>
    </div>

    <div id="scores-log" class="log-box" style="display:none;margin-top:0"></div>
  `;
}

function addScoreLog(line, color = 'var(--dim)') {
  const log = document.getElementById('scores-log');
  if (!log) return;
  log.style.display = 'block';
  const d = document.createElement('div');
  d.style.cssText  = `color:${color};margin-bottom:4px`;
  d.textContent    = line;
  log.appendChild(d);
  log.scrollTop    = log.scrollHeight;
}

export function saveApiKeysFromUI() {
  const s  = document.getElementById('ak-series')?.value.trim();
  const sc = document.getElementById('ak-scorecard')?.value.trim();
  const pl = document.getElementById('ak-players')?.value.trim();

  if (s)  setApiKey('series', s);
  if (sc) setApiKey('scorecard', sc);
  if (pl) setApiKey('players', pl);

  toast('✅ API keys saved');
}

window.syncMissingProfiles = async function() {
  const msgEl = document.getElementById('sync-profile-msg');
  const show  = (html) => { if (msgEl) { msgEl.innerHTML = html; msgEl.style.display = 'block'; } };
  show('<span style="color:var(--warn)">⏳ Scanning database for profiles… please wait.</span>');

  const t = getTournament();
  if (!t || !t.teams) { show('<span style="color:var(--err)">❌ No tournament selected.</span>'); return; }

  const allNames = [...new Set(
    t.teams.flatMap(tm => tm.players.map(p => p.originalName || p.name))
  )];

  try {
    const res = await fetch('api/match_players.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ names: allNames })
    });
    const j = await res.json();
    if (j.status !== 'success') throw new Error(j.reason || 'API error');

    const dbResults = j.results || {};
    let updated = 0;

    const newTeams = t.teams.map(tm => ({
      ...tm,
      players: tm.players.map(p => {
        const key   = p.originalName || p.name;
        const match = dbResults[key];
        if (!match) return p;

        let best = null;
        if      (match.status === 'exact')  best = match.match;
        else if (match.status === 'auto' || match.status === 'fuzzy') best = match.suggestions?.[0];

        if (best && (best.playerImg || best.role || best.country)) {
          updated++;
          return {
            ...p,
            playerImg: p.playerImg || best.playerImg || null,
            role:      p.role      || best.role      || null,
            country:   p.country   || best.country   || null
          };
        }
        return p;
      })
    }));

    updateTournament({ ...t, teams: newTeams });
    show(`<span style="color:var(--ok)">✅ Synced profiles for ${updated} players! Refresh the Leaderboard/Matches to see them.</span>`);
  } catch (err) {
    show(`<span style="color:var(--err)">❌ ${escHtml(err.message)}</span>`);
  }
};

export async function fetchSeriesMatches() {
  const sid = (document.getElementById('scores-sid')?.value || '').trim();
  const log = document.getElementById('scores-log');
  if (log) { log.innerHTML = ''; log.style.display = 'block'; }
  if (!sid) { addScoreLog('⚠️ Enter a Series ID first.', 'var(--warn)'); return; }

  const t = getTournament();
  if (!t)  { addScoreLog('❌ No tournament selected.', 'var(--err)'); return; }
  addScoreLog('📡 Fetching match schedule from series_info… (1 API hit)');

  try {
    const j = await apiFetchSeriesMatches(t.id, sid);
    if (j.status === 'success') {
      addScoreLog(`✅ "${j.series_name}" — ${j.total} matches in series`, 'var(--ok)');
      addScoreLog(`📥 New: ${j.new} added · Already in DB: ${j.existing}`, 'var(--acc)');
      (j.errors || []).forEach(e => addScoreLog(`⚠️ ${e}`, 'var(--warn)'));
      await loadTournamentsFromServer();
      renderMatchesList(getTournament());
      renderSubScores(getTournament());
    } else {
      addScoreLog('ℹ️ Server unavailable — fetching directly…', 'var(--dim)');
      await fetchSeriesMatchesDirect(sid, t);
    }
  } catch (e) {
    addScoreLog('ℹ️ No server — fetching directly…', 'var(--dim)');
    await fetchSeriesMatchesDirect(sid, t);
  }
}

async function fetchSeriesMatchesDirect(sid, t) {
  let seriesData;
  try {
    const res = await fetch(`api/cric_proxy.php?type=series&id=${sid}&apikey=${getApiKey('series')}`);
    seriesData = await res.json();
    bumpHits(1);
  } catch (e) { addScoreLog('❌ ' + e.message, 'var(--err)'); return; }

  if (seriesData?.status !== 'success') {
    addScoreLog('❌ ' + (seriesData?.reason || 'Series not found'), 'var(--err)'); return;
  }
  const allMatches = seriesData.data?.matchList || [];
  const seriesName = seriesData.data?.info?.name || sid;
  addScoreLog(`✅ "${seriesName}" — ${allMatches.length} matches found`, 'var(--ok)');

  const existingIds = new Set((t.matches || []).map(m => m.id));
  const parseMatchNum = name => { const m = name.match(/\b(\d+)(?:st|nd|rd|th)\s+match/i); return m ? parseInt(m[1]) : null; };
  const sorted = [...allMatches].sort((a, b) => {
    const na = parseMatchNum(a.name || ''), nb = parseMatchNum(b.name || '');
    if (na != null && nb != null) return na - nb;
    if (na != null) return -1; if (nb != null) return 1;
    return new Date(a.date || 0) - new Date(b.date || 0);
  });

  let added = 0, skipped = 0;
  const existingMap = new Map((t.matches || []).map(m => [m.id, m]));
  let updated = {
    ...t,
    matches: sorted.map(m => {
      if (!m.id) return null;
  
      let status = 'upcoming';
      if (m.matchEnded)        status = 'completed';
      else if (m.matchStarted) status = 'live';
  
      const old = existingMap.get(m.id);
  
      if (old) {
        skipped++;
        return {
          ...old,   // 🔥 KEEP scorecard_raw + isScored
          ...m,
          status
        };
      }
  
      added++;
      return {
        id: m.id,
        name: m.name,
        date: m.date,
        venue: m.venue || '',
        status,
        result: m.status || '',
        teamInfo: m.teamInfo || [],
        matchNumber: parseMatchNum(m.name || ''),
        isScored: false,
        scorecard_raw: null
      };
    }).filter(Boolean)
  };
  addScoreLog(`📥 Added ${added} new · Skipped ${skipped} (already in DB)`, 'var(--acc)');
  await apiUpdateTournament(updated);
  renderMatchesList(getTournament());
  renderSubScores(getTournament());
  addScoreLog(`📥 Added ${added} new · Skipped ${skipped} (already in DB)`, 'var(--acc)');
}

export async function triggerNightlySync() {
  const t = getTournament();
  if (!t) { addScoreLog('❌ No tournament selected.', 'var(--err)'); return; }
  const log = document.getElementById('scores-log');
  if (log) { log.innerHTML = ''; log.style.display = 'block'; }
  addScoreLog('🌙 Triggering nightly sync…');
  try {
    const j = await apiNightlySync(t.id);
    if (j.status === 'success') {
      addScoreLog(`✅ Scored ${j.matches_scored}/${j.matches_found} matches · Hits: ${j.api_hits_used}`, 'var(--ok)');
      (j.log || []).forEach(l => addScoreLog(l, 'var(--dim)'));
      await loadTournamentsFromServer();

      const t = getTournament();

      renderLeaderboard(t);
      renderMatchesList(t);
      renderFantasyPoints(t); // 🔥 ADD THIS
    } else {
      addScoreLog('❌ ' + (j.reason || 'Failed'), 'var(--err)');
    }
  } catch (e) {
    addScoreLog('❌ Could not reach nightly_sync.php: ' + e.message, 'var(--err)');
  }
}

export async function fetchScores() {
  const sid = (document.getElementById('scores-sid')?.value || '').trim();
  const log = document.getElementById('scores-log');
  if (log) { log.innerHTML = ''; log.style.display = 'block'; }

  const t = getTournament();
  if (!t)           { addScoreLog('❌ No tournament selected.', 'var(--err)'); return; }
  if (getHits() >= 95) { addScoreLog('❌ API limit near (95+). Try tomorrow.', 'var(--err)'); return; }
  if (!sid)         { addScoreLog('⚠️ Enter a Series ID.', 'var(--warn)'); return; }

  addScoreLog('📡 Fetching series info… (1 API hit)');
  let seriesData;
  try {
    const res  = await fetch(`api/cric_proxy.php?type=series&id=${sid}`);
    seriesData = await res.json();
    bumpHits(1);
  } catch (err) { addScoreLog('❌ ' + err.message, 'var(--err)'); return; }

  if (seriesData?.status !== 'success') { addScoreLog('❌ ' + (seriesData?.reason || 'Series not found'), 'var(--err)'); return; }

  const allMatches = seriesData.data?.matchList || [];
  const seriesName = seriesData.data?.info?.name || sid;
  addScoreLog(`✅ "${seriesName}" — ${allMatches.length} matches found`, 'var(--ok)');

  let updated = { ...t, teams: (t.teams || []).map(x => ({ ...x, players: [...(x.players || [])] })) };
 
  let upcoming = 0, live = 0, completed = 0;
  allMatches.forEach(m => { if (m.matchEnded) completed++; else if (m.matchStarted) live++; else upcoming++; });
  addScoreLog(`📅 Upcoming: ${upcoming} · 🔴 Live: ${live} · ✅ Finished: ${completed}`, 'var(--dim)');

  const existingMap = new Map((t.matches || []).map(m => [m.id, m]));

  updated.matches = allMatches.map(m => {
    // 🔥 IMPORTANT: backup matches before scoring
    const old = existingMap.get(m.id);
  
    let status = 'upcoming';
    if (m.matchEnded)        status = 'completed';
    else if (m.matchStarted) status = 'live';
  
    if (old) {
      return {
        ...old, // 🔥 KEEP OLD DATA (IMPORTANT)
        ...m,
        status
      };
    }
  
    return {
      id: m.id,
      name: m.name,
      date: m.date,
      venue: m.venue || '',
      status,
      result: m.status || '',
      teamInfo: m.teamInfo || [],
      isScored: false,
      scorecard_raw: null
    };
  });

  const scoredMatchIds = new Set(
    (t.teams || []).flatMap(tm => (tm.players || []).flatMap(p => Object.keys(p.matchPoints || {})))
  );
  const needScoring = allMatches
    .filter(m => !scoredMatchIds.has(m.id) && m.matchEnded)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!needScoring.length) {
    addScoreLog(completed === 0 ? 'ℹ️ No matches finished yet.' : '✅ All completed matches already scored.', 'var(--dim)');
    await loadTournamentsFromServer();

      const tNew = getTournament();

      renderLeaderboard(tNew);
      renderMatchesList(tNew);
      renderFantasyPoints(tNew); 
  }

  const remaining = Math.min(94 - getHits(), 10);
  const toScore   = needScoring.slice(0, remaining);
  const skipped   = needScoring.length - toScore.length;
  addScoreLog(`🏏 Scoring ${toScore.length} completed match(es)`, 'var(--acc)');

  let scorecardHits = 0;
  for (const match of toScore) {
    if (getHits() >= 94) { addScoreLog('⚠️ Hit limit close — stopping.', 'var(--warn)'); break; }
    addScoreLog(`⬇️ ${match.name.split(',')[0]}…`);
    try {
      const res = await fetch(`api/cric_proxy.php?type=scorecard&id=${match.id}`);
      const sc  = await res.json();
      scorecardHits++;
      bumpHits(1);
      if (sc?.status === 'success' && sc.data) {
        const normalized = normalizeScorecard(sc.data);
        updated = applyMatch(updated, match, normalized);

        // 🔥 update matches incrementally (NO reset)
        updated.matches = updated.matches.map(m =>
          String(m.id) === String(match.id)
            ? { ...m, scorecard_raw: JSON.stringify(sc.data), isScored: true }
            : m
        );
        const innings  = normalized.innings || [];
        if (!innings.length) { addScoreLog('⚠️ Innings not ready yet', 'var(--warn)'); }
        else {
          const batRows  = innings.reduce((s, i) => s + (i.batting  || []).length, 0);
          const bowlRows = innings.reduce((s, i) => s + (i.bowling  || []).length, 0);
          const fieldRows= innings.reduce((s, i) => s + (i.catching || []).length, 0);
          addScoreLog(`✅ ${innings.length} innings · ${batRows} bat · ${bowlRows} bowl · ${fieldRows} field`, 'var(--ok)');
        }
      } else {
        addScoreLog(`⚠️ API skipped match: ${sc?.reason || sc?.status || 'Unknown error'}`, 'var(--warn)');
        console.error("Match API Payload:", sc);
      }
    } catch (e) { scorecardHits++; bumpHits(1); addScoreLog(`❌ ${e.message}`, 'var(--err)'); }
  }

  await updateTournament(updated);

  // 🔥 IMPORTANT: reload fresh data from DB
  await loadTournamentsFromServer();

  const tNew = getTournament();

  renderLeaderboard(tNew);
  renderMatchesList(tNew);
  renderFantasyPoints(tNew); // 🔥 THIS LINE FIXES YOUR ISSUE
  
  addScoreLog(`✅ Sync finished · Hits used: ${1 + scorecardHits} · Today: ${getHits()}/100`, 'var(--ok)');
  if (skipped > 0) addScoreLog(`ℹ️ Sync again to score ${skipped} remaining`, 'var(--dim)');

}

export function filterManualPlayers() {
  const t       = getTournament();
  const matchId = document.getElementById('manual-match')?.value || '';
  const sel     = document.getElementById('manual-player');
  if (!sel) return;

  let allPlayers = (t.teams || []).flatMap(tm => tm.players || []);

  if (matchId) {
    // Match selected — only show players who have points in that match
    allPlayers = allPlayers.filter(p => p.matchPoints && p.matchPoints[matchId]);
  }

  // Sort alphabetically
  allPlayers.sort((a, b) => a.name.localeCompare(b.name));

  let options = '';
  if (!allPlayers.length) {
    options = `<option value="" disabled>No players scored in this match yet</option>`;
  } else {
    options = allPlayers.map(p => 
      `<option value="${p.id}">${escHtml(p.name)}</option>`
    ).join('');
  }

  sel.innerHTML = options;
}
// ══════════════════════════════════════════════════
// SECTION: Manual points
// ══════════════════════════════════════════════════
export function renderSubManual(t) {
  const el      = document.getElementById('sub-manual');
  const matches = (t.matches || []).filter(m => m.status === 'completed')
    .map(m => `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`).join('');

  // Default: all players (shown when no match selected)
  let allPlayers = (t.teams || []).flatMap(tm => tm.players || []);
  allPlayers.sort((a, b) => a.name.localeCompare(b.name));
  const players = allPlayers.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');


  const teams = (t.teams || [])
    .map(tm => `<option value="${tm.id}">${escHtml(tm.name)}</option>`).join('');

  el.innerHTML = `
  <div class="card mb-14">
    <div class="lbl">🎯 Player Bonus / Penalty</div>
    <div class="txt-dim fs-12" style="margin:8px 0 14px;line-height:1.6">Apply extra points (positive or negative) to a specific player.</div>
    <div class="grid-2 mb-12">
      <div>
        <div class="lbl fs-11">Player</div>
        <select class="inp" id="manual-player" style="margin-top:6px">${players}</select>
      </div>
      <div>
        <div class="lbl fs-11">Match</div>
        <select class="inp" id="manual-match" style="margin-top:6px" onchange="filterManualPlayers()">
          <option value="">— Any match —</option>${matches}
        </select>
      </div>
    </div>
    <div class="grid-3 mb-14">
      <div>
        <div class="lbl fs-11">Preset</div>
        <select class="inp" id="manual-type" style="margin-top:6px" onchange="fillManualPreset()">
          <option value="custom">Custom amount</option>
          <option value="mom">Man of the Match (+50)</option>
          <option value="hatrick">Hat-trick (+100)</option>
          <option value="potw">Player of the Week (+150)</option>
          <option value="6s">6 Sixes in over (+100)</option>
          <option value="4s">6 Fours in over (+50)</option>
          <option value="penalty">Penalty (-50)</option>
        </select>
      </div>
      <div>
        <div class="lbl fs-11">Points</div>
        <input class="inp" id="manual-pts" type="number" value="100" style="margin-top:6px"/>
      </div>
      <div>
        <div class="lbl fs-11">Category</div>
        <select class="inp" id="manual-cat" style="margin-top:6px">
          <option value="bowling">Bowling</option>
          <option value="batting">Batting</option>
          <option value="fielding">Fielding</option>
          <option value="mom">Man of Match Bonus</option>
        </select>
      </div>
    </div>
    <div style="margin-bottom:14px">
      <div class="lbl fs-11">Reason (shown in log)</div>
      <input class="inp" id="manual-reason" placeholder="e.g. Man of the Match award" style="margin-top:6px"/>
    </div>
    <button class="btn btn-success" style="width:100%" onclick="applyManualPoints()">✅ Apply Points</button>
    <div id="manual-msg" style="margin-top:10px;display:none"></div>
  </div>
  
  <div class="card">
    <div class="lbl">🎖 Tournament Awards</div>
    <div class="txt-dim fs-12" style="margin:8px 0 14px">Seasonal awards (+200 pts each).</div>
    <div class="grid-2 mb-12">
      <div>
        <div class="lbl fs-11">Player</div>
        <select class="inp" id="award-player" style="margin-top:6px">${players}</select>
      </div>
      <div>
        <div class="lbl fs-11">Award</div>
        <select class="inp" id="award-type" style="margin-top:6px">
          <option value="purple">🟣 Purple Cap (+200)</option>
          <option value="orange">🟠 Orange Cap (+200)</option>
          <option value="pot">🏆 Player of Tournament (+200)</option>
          <option value="emerging">⭐ Emerging Player (+200)</option>
        </select>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="applyTournamentAward()">Give Award</button>
  </div>
  `;
}

export function fillManualPreset() {
  const presets  = { custom: null, mom: 50, hatrick: 100, potw: 150, '6s': 100, '4s': 50, penalty: -50 };
  const labels   = { mom: 'Man of the Match', hatrick: 'Hat-trick', potw: 'Player of the Week', '6s': '6 Sixes in over', '4s': '6 Fours in over', penalty: 'Penalty' };
  // Auto-set category for each preset
  const catMap   = { mom: 'mom', hatrick: 'mom', potw: 'mom', '6s': 'mom', '4s': 'mom', penalty: 'bowling', custom: 'bowling' };

  const type = document.getElementById('manual-type')?.value;
  const pts  = document.getElementById('manual-pts');
  const rsn  = document.getElementById('manual-reason');
  const cat  = document.getElementById('manual-cat');

  if (type && presets[type] != null && pts) pts.value = presets[type];
  if (type && labels[type] && rsn)          rsn.value = labels[type];
  if (type && catMap[type] && cat)          cat.value = catMap[type];
}

export async function applyManualPoints() {
  const t        = getTournament();
  const matchId  = document.getElementById('manual-match')?.value || '';
  const playerId = document.getElementById('manual-player')?.value || '';
  const pts      = parseInt(document.getElementById('manual-pts')?.value || '0');
  const cat      = document.getElementById('manual-cat')?.value || 'bowling';
  const reason   = (document.getElementById('manual-reason')?.value || 'Manual').trim();
  const msgEl    = document.getElementById('manual-msg');

  const showMsg = (html) => { if (msgEl) { msgEl.innerHTML = html; msgEl.style.display = 'block'; } };
  if (!playerId) { showMsg('<div class="alert alert-err">Select a player.</div>');     return; }
  if (!pts)      { showMsg('<div class="alert alert-err">Enter non-zero points.</div>'); return; }

  // Try server first
  try {
    const numericId = parseInt(playerId);
    if (!isNaN(numericId)) {
      const j = await apiManualPoints({ type: 'player', player_id: numericId, match_id: matchId, points: pts, category: cat, reason, tournament_id: parseInt(t.id) });
      if (j.status === 'success') {
  await loadTournamentsFromServer();
  renderLeaderboard(getTournament());

  // If match detail is open, refresh it too
  if (matchId && state.matchDetailOpen) {
    renderFantasyPoints(matchId);
  }

  if (msgEl) {
    msgEl.innerHTML = `<div class="alert alert-ok">✅ ${escHtml(j.player)}: ${pts > 0 ? '+' : ''}${pts} pts applied (${escHtml(reason)})</div>`;
    msgEl.style.display = 'block';
  }
  return;
}
    }
  } catch (e) { console.log('Server manual points failed, using fallback'); }

  // Client-side fallback
  const updated = {
    ...t,
    teams: t.teams.map(tm => ({
      ...tm,
      players: tm.players.map(p => {
        if (String(p.id) !== String(playerId)) return p;
        const mp = { ...(p.matchPoints || {}) };
        if (matchId) {
          const cur = mp[matchId] || { batting: { points: 0 }, bowling: { points: 0 }, fielding: { points: 0 }, bonus: {} };
          const r = reason.toLowerCase();
          cur.bonus = cur.bonus || {};
          if (r.includes('man of the match') || r.includes('mom') || cat === 'mom') {
            cur.bonus.mom      = (cur.bonus.mom      || 0) + pts;
          } else if (r.includes('hat-trick') || r.includes('hatrick') || r.includes('hat trick')) {
            cur.bonus.hatrick  = (cur.bonus.hatrick  || 0) + pts;
          } else if (r.includes('6 sixes') || r.includes('six sixes')) {
            cur.bonus.sixSixes = (cur.bonus.sixSixes || 0) + pts;
          } else if (r.includes('6 fours') || r.includes('six fours')) {
            cur.bonus.sixFours = (cur.bonus.sixFours || 0) + pts;
          } else if (['batting', 'bowling', 'fielding'].includes(cat)) {
            cur[cat] = cur[cat] || { points: 0 };
            cur[cat].points = (cur[cat].points || 0) + pts;
          } else {
            cur.bonus.manual   = (cur.bonus.manual   || 0) + pts;
          }
          mp[matchId] = cur;
        }
        return {
          ...p,
          matchPoints:    mp,
          totalPoints:    (p.totalPoints    || 0) + pts,
          battingPoints:  cat === 'batting'  ? (p.battingPoints  || 0) + pts : (p.battingPoints  || 0),
          bowlingPoints:  cat === 'bowling'  ? (p.bowlingPoints  || 0) + pts : (p.bowlingPoints  || 0),
          fieldingPoints: cat === 'fielding' ? (p.fieldingPoints || 0) + pts : (p.fieldingPoints || 0),
        };;
      })
    }))
  };
  updateTournament(updated, true);
  if (matchId) renderFantasyPoints(matchId);
  renderLeaderboard(getTournament());
  showMsg(`<div class="alert alert-ok">✅ ${pts > 0 ? '+' : ''}${pts} pts applied (offline mode)</div>`);
}

export async function applyTeamAward() {
  const t      = getTournament();
  const teamId = document.getElementById('award-team')?.value || '';
  const pts    = parseInt(document.getElementById('award-pts')?.value || '0');
  const reason = (document.getElementById('award-reason')?.value || 'Award').trim();
  const msgEl  = document.getElementById('award-msg');
  const showMsg = html => { if (msgEl) { msgEl.innerHTML = html; msgEl.style.display = 'block'; } };

  if (!teamId || !pts) { showMsg('<div class="alert alert-err">Select team and enter points.</div>'); return; }
  try {
    const j = await apiManualPoints({ type: 'team', team_id: parseInt(teamId), points: pts, reason, tournament_id: parseInt(t.id) });
    if (j.status === 'success') {
      await loadTournamentsFromServer();
      renderLeaderboard(getTournament());
      showMsg(`<div class="alert alert-ok">✅ ${pts > 0 ? '+' : ''}${pts} pts applied to ${j.players_updated} players</div>`);
      return;
    }
  } catch (e) { /* fallback */ }
  // Fallback
  const updated = { ...t, teams: t.teams.map(tm => {
    if (tm.id !== teamId) return tm;
    return { ...tm, players: (tm.players || []).map(p => ({ ...p, totalPoints: (p.totalPoints || 0) + pts })) };
  }) };
  await apiUpdateTournament(updated);
  renderLeaderboard(getTournament());
  showMsg('<div class="alert alert-ok">✅ Team award applied (offline)</div>');
}

export function applyTournamentAward() {
  const t        = getTournament();
  const playerId = document.getElementById('award-player')?.value || '';
  const type     = document.getElementById('award-type')?.value || '';
  if (!playerId) return;
  const bonus = 200;
  const updated = { ...t, teams: t.teams.map(tm => ({
    ...tm, players: tm.players.map(p =>
      String(p.id) !== String(playerId) ? p : { ...p, totalPoints: (p.totalPoints || 0) + bonus }
    )
  })) };
  updateTournament(updated, true);
  renderLeaderboard(getTournament());
  const labels = { purple: '🟣 Purple Cap', orange: '🟠 Orange Cap', pot: '🏆 Player of Tournament', emerging: '⭐ Emerging Player' };
  toast(`${labels[type] || type} awarded! +${bonus} pts`, '#f59e0b', '#000', 2800);
}

// ══════════════════════════════════════════════════
// SECTION: Injury management
// ══════════════════════════════════════════════════
export function renderSubInjury(t) {
  const el = document.getElementById('sub-injury');
  el.innerHTML = `
    <div class="card">
      <div class="lbl">➕ Add Player to Team</div>
      <div class="txt-dim fs-13" style="margin:10px 0 20px;line-height:1.7">Add a new player to an owner's team. They start with 0 pts and earn points from the next match onwards.</div>
      <div id="injury-msg" style="display:none;margin-bottom:14px"></div>
      <div class="flex flex-col gap-14">
        <div>
          <div class="lbl">Team</div>
          <select class="inp" id="inj-team" onchange="updateInjuryPlayers()">
            <option value="">— Select team —</option>
            ${(t.teams || []).map(tm => `<option value="${tm.id}">${escHtml(tm.owner || tm.name)}</option>`).join('')}
          </select>
        </div>
        <div id="inj-rep-block" style="display:none">
          <div class="lbl">New Player Name</div>
          <div class="flex gap-8">
            <input class="inp flex-1" id="inj-rep" placeholder="Type player name (e.g. Hardik)" autocomplete="off"
              oninput="window.liveSearchPlayer(this.value)"
              onkeydown="if(event.key==='Enter') window.searchReplacementPlayer()"/>
            <button class="btn btn-primary" onclick="window.searchReplacementPlayer()" style="white-space:nowrap">🔍 Search</button>
          </div>
          <div id="inj-search-res" style="margin-top:10px;display:none"></div>
        </div>
        <button class="btn btn-success" id="inj-submit-btn" style="display:none" onclick="processInjury()">➕ Add Player to Team</button>
      </div>
      ${buildCurrentPlayers(t)}
    </div>
  `;
}

export function updateInjuryPlayers() {
  const teamId = document.getElementById('inj-team')?.value;
  const rb     = document.getElementById('inj-rep-block');
  const sb     = document.getElementById('inj-submit-btn');
  const res    = document.getElementById('inj-search-res');
  const repInp = document.getElementById('inj-rep');

  if (res)    { res.style.display = 'none'; res.innerHTML = ''; }
  if (repInp) repInp.value = '';
  state.injuryReplacement = null;

  if (!teamId) {
    if (rb) rb.style.display = 'none';
    if (sb) sb.style.display = 'none';
    return;
  }
  if (rb) rb.style.display = 'block';
  if (sb) sb.style.display = 'none';
}

// ── Debounce timer for live search ──
let _injSearchTimer = null;

window.liveSearchPlayer = function(val) {
  clearTimeout(_injSearchTimer);
  const q = val.trim();
  if (q.length < 2) {
    const resEl = document.getElementById('inj-search-res');
    if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }
    const btnEl = document.getElementById('inj-submit-btn');
    if (btnEl) btnEl.style.display = 'none';
    state.injuryReplacement = null;
    return;
  }
  _injSearchTimer = setTimeout(() => window.searchReplacementPlayer(), 350);
};

window.searchReplacementPlayer = async function() {
  const repName = (document.getElementById('inj-rep')?.value || '').trim();
  const resEl   = document.getElementById('inj-search-res');
  const btnEl   = document.getElementById('inj-submit-btn');

  if (!repName || repName.length < 2) return;

  if (resEl) {
    resEl.innerHTML = '<div class="txt-dim fs-12" style="padding:8px">🔍 Searching...</div>';
    resEl.style.display = 'block';
  }
  if (btnEl) btnEl.style.display = 'none';
  state.injuryReplacement = null;

  try {
    const res = await fetch(`api/search_db_players.php?q=${encodeURIComponent(repName)}`);
    const j   = await res.json();
    const results = j.results || [];

    if (!results.length) {
      resEl.innerHTML = `
        <div class="alert alert-err" style="font-size:12px;padding:8px">❌ No players found matching "${escHtml(repName)}".</div>
        <button class="btn btn-ghost" style="font-size:11px;margin-top:6px" onclick="window.selectReplacementPlayer({name:'${escAttr(repName)}',status:'unknown'})">Use "${escHtml(repName)}" anyway (no DB link)</button>
      `;
      return;
    }

    // Auto-select if exact name match
    const exactNorm = norm(repName);
    const exact = results.find(r => norm(r.name) === exactNorm);
    if (exact) {
      window.selectReplacementPlayer(exact);
      return;
    }

    // Show list of clickable results
    window._injResults = results;
    resEl.innerHTML = `
      <div class="txt-dim fs-11" style="padding:4px 0 8px;color:var(--acc);font-weight:700;text-transform:uppercase;letter-spacing:.5px">${results.length} result${results.length > 1 ? 's' : ''} — click to select</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${results.map((r, idx) => `
          <button onclick="window.selectReplacementPlayer(window._injResults[${idx}])"
            style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surf1);border:1px solid var(--bdr);border-radius:8px;cursor:pointer;text-align:left;transition:background .15s;width:100%"
            onmouseover="this.style.background='var(--surf2)'" onmouseout="this.style.background='var(--surf1)'">
            ${r.player_img
              ? `<img src="${escAttr(r.player_img)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--bdr)"/>`
              : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surf2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px">🏏</div>`
            }
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px;color:var(--txt)">${escHtml(r.name)}</div>
              <div style="font-size:11px;color:var(--dim);margin-top:2px">${[r.team, r.role].filter(Boolean).map(escHtml).join(' · ')}</div>
            </div>
          </button>
        `).join('')}
      </div>
    `;
  } catch (err) {
    resEl.innerHTML = `<div class="alert alert-err" style="padding:8px;font-size:12px">❌ Search error: ${escHtml(err.message)}</div>`;
  }
};



window.selectReplacementPlayer = function(playerData) {
  const t = getTournament();
  
  // Check if player is already on ANY team in this tournament
  const existingTeam = (t.teams || []).find(tm =>
    (tm.players || []).some(p => norm(p.name) === norm(playerData.name))
  );

  const resEl = document.getElementById('inj-search-res');
  const btnEl = document.getElementById('inj-submit-btn');

  if (existingTeam) {
    if (resEl) {
      resEl.innerHTML = `<div class="alert alert-err" style="font-size:13px;padding:8px">❌ <strong>${escHtml(playerData.name)}</strong> is already owned by <strong>${escHtml(existingTeam.owner || existingTeam.name)}</strong>. You can only add unowned players.</div>`;
    }
    if (btnEl) btnEl.style.display = 'none';
    state.injuryReplacement = null;
    return;
  }

  state.injuryReplacement = playerData;
  
  const teamHtml = playerData.team ? ` · ${escHtml(playerData.team)}` : '';
  const warnHtml = playerData.status === 'unknown' ? ` <span style="color:var(--err);font-size:11px">(No DB Link - won't get auto points)</span>` : '';
  
  if (resEl) {
    resEl.innerHTML = `<div class="alert alert-ok" style="font-size:13px;padding:8px;display:flex;align-items:center;gap:8px">
      ${playerData.playerImg ? `<img src="${escAttr(playerData.playerImg)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover"/>` : ''}
      <div>✅ Selected: <strong>${escHtml(playerData.name)}</strong><span style="color:var(--dim);font-size:11px">${teamHtml}</span>${warnHtml}</div>
    </div>`;
  }
  if (btnEl) btnEl.style.display = 'block';
};

function buildCurrentPlayers(t) {
  const injured = (t.teams || []).flatMap(tm =>
    (tm.players || []).filter(p => p.isInjured).map(p => ({ ...p, teamOwner: tm.owner || tm.name }))
  );
  if (!injured.length) return '';
  return `
    <div style="margin-top:24px">
      <div class="lbl">Injured Players</div>
      <div style="margin-top:10px">
        ${injured.map(p => {
          return `
          <div style="padding:10px 0;border-bottom:1px solid var(--bdr)">
            <div class="flex jc-between items-center">
              <div>
                <div style="color:var(--err);font-weight:600;font-size:14px">🩹 ${escHtml(p.name)}</div>
                <div class="txt-dim fs-12" style="margin-top:2px">${escHtml(p.teamOwner)}</div>
              </div>
              <span class="badge" style="background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.35);color:var(--err)">injured</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}  

export function processInjury() {
  const teamId    = document.getElementById('inj-team')?.value;
  const activeRep = state.injuryReplacement;
  const msgEl     = document.getElementById('injury-msg');
  const showMsg   = html => { if (msgEl) { msgEl.innerHTML = html; msgEl.style.display = 'block'; } };

  if (!teamId)    { showMsg('<div class="alert alert-err">Please select a team first.</div>'); return; }
  if (!activeRep) { showMsg('<div class="alert alert-err">Please search and select a player to add.</div>'); return; }

  const t    = getTournament();
  const team = (t.teams || []).find(x => String(x.id) === String(teamId));
  if (!team) return;

  // Brand new player — starts with 0 pts, earns only from next match onwards
  const newPlayer = {
    id:             activeRep.externalId || makeId('rep'),
    name:           activeRep.name,
    originalName:   activeRep.name,
    playerImg:      activeRep.playerImg  || null,
    role:           activeRep.role       || null,
    country:        activeRep.country    || null,
    cricketTeam:    activeRep.team       || null,
    totalPoints:    0,
    battingPoints:  0,
    bowlingPoints:  0,
    fieldingPoints: 0,
    matchPoints:    {},
    isInjured:      false,
    activeFromDate: new Date().toISOString()
  };

  const newTeams = (t.teams || []).map(tm => {
    if (String(tm.id) !== String(teamId)) return tm;
    return { ...tm, players: [...(tm.players || []), newPlayer] };
  });

  updateTournament({ ...t, teams: newTeams });
  state.injuryReplacement = null;
  showMsg(`<div class="alert alert-ok">✅ <strong>${escHtml(newPlayer.name)}</strong> added to <strong>${escHtml(team.owner || team.name)}</strong>'s team with 0 pts. They'll earn points from next match onwards.</div>`);
  renderSubInjury(getTournament());
}