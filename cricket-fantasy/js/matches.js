// ═══════════════════════════════════════════════════
// MATCHES — match list, detail view, fantasy points
// ═══════════════════════════════════════════════════
import { state, getTournament } from './state.js';
import { escHtml, escAttr }              from './utils.js';
import { getWeekKeyFromMatch, weekKey } from './week.js';
import { loadTournamentsFromServer } from './api.js';

// ── Match list ────────────────────────────────────
export function renderMatchesList(t) {
  const matches = t.matches || [];
  const el      = document.getElementById('matches-content');

  if (!matches.length) {
    el.innerHTML = '<div class="txt-dim ta-center" style="padding:60px;font-size:15px">🏏<br><br>No matches processed yet<br><span class="fs-12">Use Admin → Manage → Fetch Scores to load matches</span></div>';
    return;
  }

  const sorted = [...matches].sort((a, b) => {
    // 1: Live (Top), 2: Completed, 3: Upcoming (Bottom)
    const statusOrder = { live: 0, completed: 1, upcoming: 2 };
    const sa = statusOrder[a.status] ?? 2;
    const sb = statusOrder[b.status] ?? 2;
    
    if (sa !== sb) return sa - sb; // Group by status
    
    const tA = new Date(a.date || 0).getTime();
    const tB = new Date(b.date || 0).getTime();
    
    // Completed: Sort descending (most recently finished at top)
    if (sa === 1) return tB - tA;
    
    // Live & Upcoming: Sort ascending (happening soonest at top)
    return tA - tB;
  });

  el.innerHTML = sorted.map(m => {
    const ti       = m.teamInfo || [];
    const teamImgs = ti.slice(0, 2).map(team => `
      <div style="display:flex;align-items:center;gap:7px;min-width:0">
        <img src="${team.img || ''}" style="width:28px;height:28px;border-radius:50%;background:#1e293b;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>
        <span style="font-weight:700;font-size:13px;color:var(--txt);white-space:nowrap">${escHtml(team.shortname || team.name)}</span>
      </div>
    `).join('<span style="color:var(--dim);font-size:12px;padding:0 4px">vs</span>');

    const statusBg    = m.status === 'completed' ? 'rgba(52,211,153,.15)' : m.status === 'live' ? 'rgba(251,191,36,.15)' : 'rgba(56,189,248,.15)';
    const statusBdr   = m.status === 'completed' ? 'rgba(52,211,153,.35)' : m.status === 'live' ? 'rgba(251,191,36,.35)' : 'rgba(56,189,248,.35)';
    const statusColor = m.status === 'completed' ? '#34d399' : m.status === 'live' ? '#fbbf24' : '#38bdf8';

    // ── C/VC row for this match's week ──────────
    const matchWeekKey = m.date ? weekKey(new Date(m.date)) : null;
    const wc           = matchWeekKey ? (t.weeklyCaptains?.[matchWeekKey] || {}) : {};
    const capRows      = (t.teams || []).map(team => {
      const sel = wc[team.id];
      if (!sel) return '';
      const cap = (team.players || []).find(p => p.id === sel.captain);
      const vc  = (team.players || []).find(p => p.id === sel.vc);
      if (!cap) return '';
      return `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0">
          <span style="font-size:11px;color:var(--dim);min-width:60px">${escHtml(team.owner || team.name)}</span>
          <span style="font-size:11px;font-weight:700;background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:5px;padding:1px 7px">
            👑 C: ${escHtml(cap.name)}
          </span>
          ${vc ? `<span style="font-size:11px;font-weight:700;background:rgba(139,92,246,.15);color:#a78bfa;border:1px solid rgba(139,92,246,.3);border-radius:5px;padding:1px 7px">
            ⭐ VC: ${escHtml(vc.name)}
          </span>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="card mb-12" onclick="showMatchDetail('${m.id}')"
           style="cursor:pointer;transition:background .15s"
           onmouseenter="this.style.background='var(--surfh)'"
           onmouseleave="this.style.background=''">
        ${ti.length >= 2 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">${teamImgs}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="min-width:0">
            <div class="fw-700 txt-main" style="font-size:13px;line-height:1.4">${escHtml(m.name)}</div>
            ${m.venue ? `<div class="txt-dim" style="font-size:11px;margin-top:3px">📍 ${escHtml(m.venue)}</div>` : ''}
            <div class="txt-dim" style="font-size:11px;margin-top:2px">📅 ${m.date || ''}</div>
          </div>
          <span class="badge" style="background:${statusBg};border:1px solid ${statusBdr};color:${statusColor}">
            ${m.status}
          </span>
        </div>
        ${m.result ? `<div style="color:var(--ok);font-size:12px;font-weight:600;margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr)">🏆 ${escHtml(m.result)}</div>` : ''}

        ${capRows ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bdr)" onclick="event.stopPropagation()">
            <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--dim);margin-bottom:6px">THIS WEEK'S CAPTAIN & VC</div>
            ${capRows}
          </div>` : ''}
      </div>`;
  }).join('');
}

// ── Match detail view ─────────────────────────────
export async function showMatchDetail(matchId) {
  state.matchDetailOpen = true;
  
  // 🔥 ALWAYS LOAD FRESH DATA
  await loadTournamentsFromServer();

  const t = getTournament();
  const match = (t.matches || []).find(m => m.id === matchId);
  if (!match) return;

  const el   = document.getElementById('matches-content');
  const ti   = match.teamInfo || [];

  const teamBanner = ti.length >= 2 ? `
    <div style="display:flex;align-items:center;gap:16px;background:var(--accd);border:1px solid var(--bdra);border-radius:12px;padding:14px 18px;margin-bottom:16px;flex-wrap:wrap">
      ${ti.map(team => `
        <div style="display:flex;align-items:center;gap:10px">
          <img src="${team.img || ''}" style="width:36px;height:36px;border-radius:50%;background:#1e293b;object-fit:cover" onerror="this.style.display='none'"/>
          <div>
            <div style="font-weight:800;color:var(--txt);font-size:15px">${escHtml(team.name || '')}</div>
            <div style="color:var(--dim);font-size:11px">${escHtml(team.shortname || '')}</div>
          </div>
        </div>
      `).join('<div style="flex:1;text-align:center;color:var(--dim);font-weight:900;font-size:18px">vs</div>')}
    </div>` : '';

  const scorePills = (match.score || []).map(s => `
    <span style="background:var(--surf1);border:1px solid var(--bdr);border-radius:8px;padding:4px 12px;font-size:13px;font-weight:700;color:var(--txt)">
      ${escHtml(s.inning || '')} &nbsp;
      <span style="color:var(--acc)">${s.r}/${s.w}</span>
      <span style="color:var(--dim);font-size:11px;margin-left:4px">(${s.o} ov)</span>
    </span>`).join('');

  el.innerHTML = `
    <button class="btn btn-ghost mb-20"
      onclick="state.matchDetailOpen=false; renderMatchesList(getTournament())">← Back</button>
    ${teamBanner}
    <div class="fw-800 txt-main" style="font-size:18px;margin-bottom:4px">${escHtml(match.name)}</div>
    ${match.venue ? `<div class="txt-dim fs-12" style="margin-bottom:6px">📍 ${escHtml(match.venue)}</div>` : ''}
    ${scorePills ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${scorePills}</div>` : ''}
    <div style="color:var(--ok);font-weight:600;font-size:13px;margin-bottom:20px">🏆 ${escHtml(match.result || match.status || '')}</div>
    <div id="md-pane-pts">
      <div class="txt-dim ta-center" style="padding:30px">⏳ Calculating fantasy points…</div>
    </div>
  `;

  renderFantasyPoints(matchId);
}

// ── Fantasy points breakdown for one match ────────
export function renderFantasyPoints(matchId) {
  const t     = getTournament();
  const ptsEl = document.getElementById('md-pane-pts');
  if (!t || !ptsEl) { if (ptsEl) ptsEl.innerHTML = '<div class="txt-dim">No data</div>'; return; }

  const wkKey = getWeekKeyFromMatch(matchId, t);

  // ── Try exact week key first, then check ALL weeks as fallback ──
  const wc = (() => {
    const wca = t.weeklyCaptains || {};
    // Exact match first
    if (wkKey && wca[wkKey]) return wca[wkKey];
    // Fallback: find the most recent week that is <= match date
    const matchDate = (t.matches || []).find(m => m.id === matchId)?.date;
    if (!matchDate) return {};
    const matchTs = new Date(matchDate).getTime();
    const sortedWks = Object.keys(wca).sort().reverse();
    for (const wk of sortedWks) {
      if (new Date(wk).getTime() <= matchTs) return wca[wk];
    }
    // Last resort: use latest week
    if (sortedWks.length) return wca[sortedWks[0]];
    return {};
  })();

  const teamsSorted = (t.teams || [])
    .map(team => {
      const active = (team.players || []).filter(p => !p.isInjured && p.matchPoints && p.matchPoints[String(matchId)] !== undefined);
      const total  = active.reduce((s, p) => {
        const mp = p.matchPoints[String(matchId)] || {};
        const base       = (mp.batting?.points  || 0) + (mp.bowling?.points  || 0) + (mp.fielding?.points || 0)
                         + (mp.bonus?.milestone || 0) + (mp.bonus?.mom || 0)
                         + (mp.bonus?.manual    || 0) + (mp.bonus?.hatrick  || 0)
                         + (mp.bonus?.sixSixes  || 0) + (mp.bonus?.sixFours || 0);
        const teamCap    = wc[team.id] || {};
        const isCaptain  = String(teamCap.captain) === String(p.id);
        const isVC       = String(teamCap.vc) === String(p.id);
        const multiplier = isCaptain ? 2 : isVC ? 1.5 : 1;
        return s + Math.round(base * multiplier);
      }, 0);
      return { team, active, total };
    })
    .filter(x => x.active.length)
    .sort((a, b) => b.total - a.total);

  ptsEl.innerHTML = teamsSorted.map(obj => {
    const sorted = [...obj.active].sort((a, b) => {
      const ma = a.matchPoints[String(matchId)] || {};
const mb = b.matchPoints[String(matchId)] || {};
      const base = x => (x.batting?.points  || 0) + (x.bowling?.points  || 0) + (x.fielding?.points || 0)
                      + (x.bonus?.mom || 0) + (x.bonus?.manual || 0)
                      + (x.bonus?.hatrick || 0) + (x.bonus?.sixSixes || 0) + (x.bonus?.sixFours || 0);
      return base(mb) - base(ma);
    });

    return `
    <div class="card mb-14">
      <div class="lbl txt-acc">${escHtml(obj.team.name)} — ${obj.total} pts</div>
      ${sorted.map(p => {
        const mp = p.matchPoints[String(matchId)] || {};
        const teamCap   = wc[obj.team.id] || {};
        const isCaptain = String(teamCap.captain) === String(p.id);
        const isVC      = String(teamCap.vc) === String(p.id);
        const base      = (mp.batting?.points  || 0) + (mp.bowling?.points  || 0) + (mp.fielding?.points || 0)
                        + (mp.bonus?.milestone || 0) + (mp.bonus?.mom || 0)
                        + (mp.bonus?.manual    || 0) + (mp.bonus?.hatrick  || 0)
                        + (mp.bonus?.sixSixes  || 0) + (mp.bonus?.sixFours || 0);
        const multiplier = isCaptain ? 2 : isVC ? 1.5 : 1;
        const tot       = Math.round(base * multiplier);

        return `
          <div class="flex gap-10 player-row"
               onclick="toggleStats(this)"
               style="padding:8px 0;border-bottom:1px solid var(--bdr);cursor:pointer;align-items:center">
            <img src="${p.playerImg ? escAttr(p.playerImg) : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=64748b&bold=true`}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=64748b&bold=true'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--bdr);flex-shrink:0"/>
            <div class="flex-1">
              <div class="fw-600 txt-main" style="display:flex;align-items:center;flex-wrap:wrap">
                ${escHtml(p.name)}
                ${p.role ? `<span style="font-size:10px;color:var(--dim);margin-left:6px;font-weight:600">· ${escHtml(p.role)}</span>` : ''}
                ${isCaptain ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;background:rgba(251,191,36,.2);color:#fbbf24;border:1px solid rgba(251,191,36,.4)">C</span><span style="font-size:11px;color:#fbbf24;font-weight:700;margin-left:3px">×2</span>` : isVC ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;background:rgba(139,92,246,.2);color:#a78bfa;border:1px solid rgba(139,92,246,.35)">VC</span><span style="font-size:11px;color:#a78bfa;font-weight:700;margin-left:3px">×1.5</span>` : ''}
                ${mp.bonus?.mom > 0 ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;margin-left:6px;background:rgba(236,72,153,.2);color:#f472b6;border:1px solid rgba(236,72,153,.4)">🏆 MOM</span>` : ''}
                <span class="toggle-arrow" style="margin-left:6px;font-size:10px;color:#9ca3af">▼</span>
                <span style="font-size:12px;color:#fff;font-weight:700;margin-left:12px;white-space:nowrap;letter-spacing:0.3px">🏏 ${mp.batting?.points||0} &nbsp;·&nbsp; ⚾ ${mp.bowling?.points||0} &nbsp;·&nbsp; 🧤 ${mp.fielding?.points||0}${mp.negative < 0 ? ` &nbsp;·&nbsp; <span style="color:#ef4444">📉 ${mp.negative}</span>` : ''}</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              ${multiplier > 1
                ? `<span style="font-size:12px;color:var(--dim);text-decoration:line-through;margin-right:4px">${base}</span><span class="fw-800" style="font-size:16px;color:${isCaptain?'#fbbf24':'#a78bfa'}">${tot}</span>`
                : `<span class="txt-acc fw-700" style="font-size:15px">${tot}</span>`}
            </div>
          </div>
          <div class="player-stats" style="display:none;padding:12px;border-bottom:1px solid var(--bdr);background:#111;color:#fff;">

            <div class="stat-block" style="background:#0a0e17; padding:12px; border-radius:10px; margin-bottom:12px; border:1px solid #1e293b;">
              <div class="fw-700 txt-main mb-6" style="color:#fff;">🏏 Batting</div>
              <table style="width:100%; table-layout:fixed; border-collapse:collapse; background:transparent;">
                <colgroup>
                  <col style="width:45%;">
                  <col style="width:30%;">
                  <col style="width:25%;">
                </colgroup>
                ${(() => {
                  if (!mp.batting) return `<tr><td colspan="2" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">0</td></tr>`;
                  
                  let r = mp.batting.runs || 0;
                  let b = mp.batting.balls || 0;
                  let f = mp.batting.fours || 0;
                  let s = mp.batting.sixes || 0;
                  let sr = mp.batting.strikeRate || 0;
                  
                  let K = [200, 150, 125, 100, 75, 50, 25].find(t => r >= t) || 0;
                  let L = 0;
                  if (sr < 50) L=-60; else if (sr < 75) L=-40; else if (sr < 100) L=-20; else if (sr < 125) L=-10;
                  else if (sr <= 150) L=0; else if (sr <= 175) L=10; else if (sr <= 200) L=20; else if (sr <= 250) L=40; else if (sr <= 300) L=60; else if (sr <= 350) L=80; else L=100;
                  let M = (r > 20 || b >= 10) ? L : 0;
                  let boundPts = (f * 1) + (s * 2);
                  let baseCalc = r + K + M + boundPts;
                  let duck_out = mp.batting.points - baseCalc;
                  
                  let txt = '';
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Runs / Balls</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${r} / ${b}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${r>0?'+':''}${r}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">4s / 6s</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${f} / ${s}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${boundPts>0?'+':''}${boundPts}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Strike Rate</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${sr}</td><td class="fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b; color:${M>0?'#38bdf8':M<0?'#ef4444':'#cbd5e1'}">${M>0?'+':''}${M}</td></tr>`;
                  
                  if (K > 0) txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Runs Milestone</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${K}</td></tr>`;
                  if (duck_out === 10) txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Not Out Bonus</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+10</td></tr>`;
                  if (duck_out === -10) txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#ef4444;">Duck Penalty</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#ef4444;">-10</td></tr>`;
                  
                  txt += `<tr><td colspan="2" class="fw-800" style="padding:8px 0; color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:8px 0; border-bottom:none; font-size:15px; color:#fff;">${mp.batting.points||0}</td></tr>`;
                  return txt;
                })()}
              </table>
            </div>

            <div class="stat-block" style="background:#0a0e17; padding:12px; border-radius:10px; margin-bottom:12px; border:1px solid #1e293b;">
              <div class="fw-700 txt-main mb-6" style="color:#fff;">⚾ Bowling</div>
              <table style="width:100%; table-layout:fixed; border-collapse:collapse; background:transparent;">
                <colgroup>
                  <col style="width:45%;">
                  <col style="width:30%;">
                  <col style="width:25%;">
                </colgroup>
                ${(() => {
                  if (!mp.bowling) return `<tr><td colspan="2" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">0</td></tr>`;
                  
                  let w = mp.bowling.wickets || 0;
                  let mdn = mp.bowling.maidens || 0;
                  let ov = mp.bowling.overs || 0;
                  let eco = mp.bowling.economy || 0;
                  let wd = mp.bowling.wides || 0;
                  let nb = mp.bowling.noballs || 0;
                  
                  let wBase = w * 25;
                  let wMilestone = [ {min: 8, pts: 175}, {min: 7, pts: 150}, {min: 6, pts: 125}, {min: 5, pts: 100}, {min: 4, pts: 75}, {min: 3, pts: 50} ].find(t => w >= t.min)?.pts || 0;
                  let wTotal = wBase + wMilestone;
                  let mPts = mdn * 40;
                  let extPts = -(wd + nb) * 2;
                  
                  let ecoPts = 0;
                  if (ov >= 2) {
                    ecoPts = [ {max: 0.99, pts: 120}, {max: 1.99, pts: 80}, {max: 3.99, pts: 40}, {max: 5.99, pts: 20}, {max: 7.99, pts: 10}, {max: 10, pts: 0}, {max: 12, pts: -10}, {max: 14, pts: -20}, {max: 16, pts: -40}, {max: Infinity, pts: -60} ].find(t => eco <= t.max)?.pts || 0;
                  }
                  
                  let expected = wTotal + mPts + extPts + ecoPts;
                  let lbwBowledPts = mp.bowling.points - expected;
                  
                  let txt = '';
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Wickets</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${w}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${wTotal>0?'+':''}${wTotal}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Maiden Overs</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${mdn}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${mPts>0?'+':''}${mPts}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Economy</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${eco}</td><td class="fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b; color:${ecoPts>0?'#38bdf8':ecoPts<0?'#ef4444':'#cbd5e1'}">${ecoPts>0?'+':''}${ecoPts}</td></tr>`;
                  if (wd > 0 || nb > 0) txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#ef4444;">Wides / N.B.</td><td class="fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#ef4444;">${wd}w, ${nb}nb</td><td class="fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#ef4444;">${extPts}</td></tr>`;
                  if (lbwBowledPts > 0) txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">LBW / Bowled Bonus</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${lbwBowledPts}</td></tr>`;
                  
                  txt += `<tr><td colspan="2" class="fw-800" style="padding:8px 0; color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:8px 0; font-size:15px; color:#fff;">${mp.bowling.points||0}</td></tr>`;
                  return txt;
                })()}
               </table>
            </div>

            <div class="stat-block" style="background:#0a0e17; padding:12px; border-radius:10px; margin-bottom:12px; border:1px solid #1e293b;">
              <div class="fw-700 txt-main mb-6" style="color:#fff;">🧤 Fielding</div>
              <table style="width:100%; table-layout:fixed; border-collapse:collapse; background:transparent;">
                <colgroup>
                  <col style="width:45%;">
                  <col style="width:30%;">
                  <col style="width:25%;">
                </colgroup>
                ${(() => {
                  if (!mp.fielding) return `<tr><td colspan="2" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:6px 0;border-bottom:1px solid #1e293b;color:#fff;">0</td></tr>`;
                  let c = mp.fielding.catches || 0;
                  let r = mp.fielding.runouts || 0;
                  let s = mp.fielding.stumpings || 0;
                  let txt = '';
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Catches</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${c}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${c>0?'+':''}${c*10}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Runouts</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${r}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${r>0?'+':''}${r*10}</td></tr>`;
                  txt += `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Stumpings</td><td class="txt-acc fw-700 ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b;">${s}</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${s>0?'+':''}${s*10}</td></tr>`;
                  txt += `<tr><td colspan="2" class="fw-800" style="padding:8px 0; color:#fff;">Total Pts</td><td class="fw-900 ta-right" style="padding:8px 0; font-size:15px; color:#fff;">${mp.fielding.points||0}</td></tr>`;
                  return txt;
                })()}
              </table>
            </div>

            ${((mp.bonus?.mom||0)+(mp.bonus?.manual||0)+(mp.bonus?.milestone||0)+(mp.bonus?.hatrick||0)+(mp.bonus?.sixSixes||0)+(mp.bonus?.sixFours||0)) > 0 ? `
            <div class="stat-block" style="background:#0a0e17; padding:12px; border-radius:10px; margin-bottom:12px; border:1px solid #1e293b;">
              <div class="fw-700 txt-main mb-6" style="color:#fff;">⭐ Bonus</div>
              <table style="width:100%; table-layout:fixed; border-collapse:collapse; background:transparent;">
                <colgroup>
                  <col style="width:45%;">
                  <col style="width:30%;">
                  <col style="width:25%;">
                </colgroup>
                ${(mp.bonus?.mom      ||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Man of the Match</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${mp.bonus.mom}</td></tr>`      : ''}
                ${(mp.bonus?.hatrick  ||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Hat-trick</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${mp.bonus.hatrick}</td></tr>`  : ''}
                ${(mp.bonus?.sixSixes ||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">6 Sixes in Over</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${mp.bonus.sixSixes}</td></tr>` : ''}
                ${(mp.bonus?.sixFours ||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">6 Fours in Over</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${mp.bonus.sixFours}</td></tr>` : ''}
                ${(mp.bonus?.milestone||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Milestone</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">+${mp.bonus.milestone}</td></tr>`: ''}
                ${(mp.bonus?.manual   ||0) ? `<tr><td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Other Bonus</td><td class="ta-center" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#475569">—</td><td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${mp.bonus.manual>0?'+':''}${mp.bonus.manual}</td></tr>` : ''}
              </table>
            </div>` : ''}

            <div class="stat-block" style="${isCaptain ? 'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3)' : isVC ? 'background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.3)' : 'background:#0a0e17;border:1px solid #1e293b'}; padding:12px; border-radius:10px;">
              <div class="fw-700 mb-6" style="color:#fff;">👑 Role</div>
              <table style="width:100%; table-layout:fixed; border-collapse:collapse; background:transparent;">
                <colgroup>
                  <col style="width:45%;">
                  <col style="width:30%;">
                  <col style="width:25%;">
                </colgroup>
                <tr>
                  <td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Role</td>
                  <td colspan="2" class="ta-right fw-800" style="padding:6px 0; border-bottom:1px solid #1e293b; color:${isCaptain ? '#fbbf24' : isVC ? '#a78bfa' : '#94a3b8'}">
                    ${isCaptain ? '👑 Captain' : isVC ? '⭐ Vice Captain' : '—'}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Multiplier</td>
                  <td colspan="2" class="ta-right fw-800" style="padding:6px 0; border-bottom:1px solid #1e293b; color:${isCaptain ? '#fbbf24' : isVC ? '#a78bfa' : '#94a3b8'}">
                    ${isCaptain ? '2×' : isVC ? '1.5×' : '1×'}
                  </td>
                </tr>
                ${(isCaptain || isVC) ? `
                <tr>
                  <td colspan="2" style="padding:6px 0; border-bottom:1px solid #1e293b; color:#cbd5e1;">Base Pts</td>
                  <td class="txt-acc fw-700 ta-right" style="padding:6px 0; border-bottom:1px solid #1e293b;">${base}</td>
                </tr>
                <tr>
                  <td colspan="2" class="fw-800" style="padding:8px 0; color:#fff;">Final Pts</td>
                  <td class="fw-900 ta-right" style="padding:8px 0; font-size:15px; color:${isCaptain ? '#fbbf24' : '#a78bfa'}">${tot}</td>
                </tr>` : ''}
              </table>
            </div>

          </div>`;
      }).join('')}
    </div>`;
  }).join('');

  if (!teamsSorted.length) {
    ptsEl.innerHTML = '<div class="txt-dim ta-center">No fantasy points yet</div>';
  }
}