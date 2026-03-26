// ═══════════════════════════════════════════════════
// LEADERBOARD — standings + top performers
// ═══════════════════════════════════════════════════
import { escHtml, escAttr, norm } from './utils.js';
import { weekKey } from './week.js';

// ── Captain multiplier helper (used here AND in matches.js) ──
export function playerTotalWithCap(player, tournament) {
  const wc = tournament.weeklyCaptains || {};
  const matches = tournament.matches || [];
  const mp = player.matchPoints || {};

  // Find which team this player belongs to (needed for team-scoped captain lookup)
  let playerTeamId = null;
  for (const tm of (tournament.teams || [])) {
    if ((tm.players || []).some(p => p.id === player.id)) {
      playerTeamId = String(tm.id);
      break;
    }
  }

  const allWkKeys = Object.keys(wc).sort();

  // For a given match date, find captain selection for this player's team.
  // Uses exact week first, then falls back to most recent past week.
  // This matches the same logic as renderFantasyPoints in matches.js.
  function getCapForMatch(matchDate) {
    if (!playerTeamId || !matchDate) return {};
    const matchTs = new Date(matchDate).getTime();
    const matchWk = weekKey(new Date(matchDate));

    // 1. Exact week match
    const exact = wc[matchWk]?.[playerTeamId];
    if (exact) return exact;

    // 2. Most recent week whose Monday is <= match date
    const sorted = [...allWkKeys].reverse();
    for (const wk of sorted) {
      if (new Date(wk).getTime() <= matchTs) {
        const sel = wc[wk]?.[playerTeamId];
        if (sel) return sel;
      }
    }

    // 3. Last resort: use latest week
    if (sorted.length) return wc[sorted[0]]?.[playerTeamId] || {};

    return {};
  }

  let matchTotal = 0;
  let mpRaw = 0;

  Object.entries(mp).forEach(([matchId, pts]) => {

    const base =
      (pts.batting?.points || 0) +
      (pts.bowling?.points || 0) +
      (pts.fielding?.points || 0) +
      (pts.bonus?.milestone || 0) +
      (pts.bonus?.mom || 0) +
      (pts.bonus?.manual || 0) +
      (pts.bonus?.hatrick || 0) +
      (pts.bonus?.sixSixes || 0) +
      (pts.bonus?.sixFours || 0);

    mpRaw += base;

    const match = matches.find(m => m.id === matchId);
    const matchDate = match?.date || null;
    const cap = getCapForMatch(matchDate);

    const isC = cap && String(cap.captain) === String(player.id);
    const isVC = cap && String(cap.vc) === String(player.id);
    const mult = isC ? 2 : isVC ? 1.5 : 1;

    matchTotal += base * mult;
  });

  // Fallback: points applied at team/tournament level (no matchPoints entry)

  return Math.round(matchTotal * 10) / 10;
}

// ── Latest-week captain badge for a player ────────
export function captainBadge(playerId, tournament) {
  const wc = tournament.weeklyCaptains || {};
  const sortedWks = Object.keys(wc).sort().reverse();
  for (const wk of sortedWks) {
    for (const sel of Object.values(wc[wk] || {})) {
      if (playerId === sel.captain) return 'C';
      if (playerId === sel.vc) return 'VC';
    }
  }
  return null;
}

// ── Main leaderboard renderer ─────────────────────
export function renderLeaderboard(t) {
  const teams = t.teams || [];

  const ranked = [...teams]
    .map(tm => ({ ...tm, total: (tm.players || []).filter(p => !p.isInjured).reduce((s, p) => s + playerTotalWithCap(p, t), 0) }))
    .sort((a, b) => b.total - a.total);

  const allP = teams.flatMap(tm =>
    (tm.players || []).map(p => ({
      ...p,
      teamName: tm.name,
      ownerName: tm.owner || tm.name,
      cricketTeam: p.cricketTeam || p.country || '',
      capBadge: captainBadge(p.id, t),
      totalWithCap: playerTotalWithCap(p, t)
    }))
  ).sort((a, b) => b.totalWithCap - a.totalWithCap);

  // ── Top Performers ────────────────────────────
  const medals = ['🥇', '🥈', '🥉'];
  const tpBlock = document.getElementById('top-performers');
  const tpList = document.getElementById('top-performers-list');
  if (allP.length) {
    tpBlock.style.display = 'block';
    tpList.innerHTML = allP.map((p, i) => {
      const medalColor = ['var(--gold)', 'var(--silver)', 'var(--bronze)'][i] || 'var(--dim)';
      const pts = p.totalWithCap || p.totalPoints || 0;
      const badge = p.capBadge
        ? `<span style="display:inline-flex;align-items:center;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;margin-right:6px;${p.capBadge === 'C'
          ? 'background:rgba(251,191,36,.2);color:#fbbf24;border:1px solid rgba(251,191,36,.4)'
          : 'background:rgba(139,92,246,.2);color:#a78bfa;border:1px solid rgba(139,92,246,.35)'
        }">${p.capBadge}</span>`
        : '';
      const natLine = p.cricketTeam
        ? `<div style="font-size:12px;color:var(--dim);margin-top:3px">🏏 ${escHtml(p.cricketTeam)}</div>` : '';
      const ownerLine = `<div style="font-size:12px;color:var(--acc);margin-top:2px">👤 ${escHtml(p.ownerName || p.teamName)}</div>`;
      const fallbackImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=64748b&bold=true`;
      const imgSrc = p.playerImg ? escAttr(p.playerImg) : fallbackImg;
      const picHtml = `<img src="${imgSrc}" onerror="this.src='${fallbackImg}'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid var(--bdr);flex-shrink:0"/>`;
      const roleHtml = p.role ? `<span style="font-size:11px;color:var(--dim);margin-left:8px;font-weight:600">· ${escHtml(p.role)}</span>` : '';
      return `
        <div class="flex items-center gap-12" style="padding:11px 0;border-bottom:1px solid var(--bdr)">
          <span style="font-size:20px;min-width:28px;text-align:center;font-weight:900;color:${medalColor}">${medals[i] || i + 1}</span>
          ${picHtml}
          <div class="flex-1" style="min-width:0">
            <div class="fw-700 txt-main" style="font-size:14px;display:flex;align-items:center;flex-wrap:wrap">
              ${badge}${escHtml(p.name)}${roleHtml} &nbsp; ${ownerLine}
            </div>
            ${natLine}
          </div>
          <div class="ta-right" style="flex-shrink:0">
            <div class="txt-acc fw-800" style="font-size:18px">${pts}</div>
            <div class="fs-10 txt-dim">pts</div>
          </div>
        </div>`;
    }).join('');
  } else {
    tpBlock.style.display = 'none';
  }

  // ── Standings ─────────────────────────────────
  const standList = document.getElementById('standings-list');
  if (!ranked.length) {
    standList.innerHTML = '<div class="txt-dim ta-center" style="padding:30px">No teams yet</div>';
    return;
  }
  standList.innerHTML = '';
  let prevPoints = null;

  ranked.forEach((team, i) => {
    const isLeader = i === 0;
    const diff = i !== 0 ? prevPoints - (team.total || 0) : 0;
    prevPoints = team.total || 0;
    const rankColor = isLeader ? '#10b981' : '#f87171';
    const statusLbl = isLeader
      ? '🟢 Leader'
      : `🔴 ${diff % 1 === 0 ? diff : diff.toFixed(1)} pts behind`;
    const ownerTag = team.owner && norm(team.owner) !== norm(team.name)
      ? `<span style="color:var(--acc)">👤 ${escHtml(team.owner)}</span>` : '';
    const displayTotal = (team.total || 0) % 1 === 0
      ? (team.total || 0)
      : (team.total || 0).toFixed(1);

    const row = document.createElement('div');
    row.className = 'team-row';
    row.innerHTML = `
      <span style="width:32px;text-align:center;font-size:18px;font-weight:900;color:${['var(--gold)', 'var(--silver)', 'var(--bronze)'][i] || 'var(--dim)'}">
        ${['🥇', '🥈', '🥉'][i] || i + 1}
      </span>
      <div class="flex-1">
        <div class="fw-800 txt-main" style="font-size:16px">${escHtml(team.name)}</div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;color:${rankColor}">${statusLbl}</span>
          ${ownerTag ? `<span class="fs-11">${ownerTag}</span>` : ''}
        </div>
      </div>
      <div class="ta-right" style="margin-right:10px">
        <div style="font-size:22px;font-weight:800;color:${rankColor}">${displayTotal}</div>
        <div class="fs-10 txt-dim">TOTAL PTS</div>
      </div>
      <span class="txt-dim fs-13" id="arrow-${i}">▼</span>
    `;

    // ── Expanded player breakdown ───────────────
    const detail = document.createElement('div');
    detail.style.cssText = 'display:none;padding:0 0 14px 46px';

    const sortedPlayers = (team.players || []).sort((a, b) => playerTotalWithCap(b, t) - playerTotalWithCap(a, t));

    detail.innerHTML = sortedPlayers.map(p => {
      const badge = captainBadge(p.id, t);
      const badgePill = badge
        ? `<span style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:5px;margin-right:5px;${badge === 'C'
          ? 'background:rgba(251,191,36,.2);color:#fbbf24'
          : 'background:rgba(139,92,246,.2);color:#a78bfa'
        }">${badge}</span>`
        : '';
      const pPts = playerTotalWithCap(p, t);
      const mp = p.matchPoints || {};
      const matches = t.matches || [];

      const matchRows = matches.slice().reverse().map(m => {
        const pts = mp[m.id] || {};
        let total = (pts.batting?.points || 0) +
          (pts.bowling?.points || 0) +
          (pts.fielding?.points || 0) +
          (pts.bonus?.mom || 0) +
          (pts.bonus?.manual || 0) +
          (pts.bonus?.milestone || 0) +
          (pts.bonus?.hatrick || 0) +
          (pts.bonus?.sixSixes || 0) +
          (pts.bonus?.sixFours || 0);
        if (total === 0) return '';

        const wc = t.weeklyCaptains || {};
        const sortedWks = Object.keys(wc).sort().reverse();
        let cap = {};
        if (m.date) {
          const matchTs = new Date(m.date).getTime();
          const exactWk = weekKey(new Date(m.date));
          if (wc[exactWk]?.[team.id]) {
            cap = wc[exactWk][team.id];
          } else {
            for (const wk of sortedWks) {
              if (new Date(wk).getTime() <= matchTs && wc[wk]?.[team.id]) {
                cap = wc[wk][team.id];
                break;
              }
            }
          }
        }

        const isC = cap && String(cap.captain) === String(p.id);
        const isVC = cap && String(cap.vc) === String(p.id);
        const mult = isC ? 2 : isVC ? 1.5 : 1;
        total = Math.round(total * mult * 10) / 10;

        return `
          <tr style="border-bottom:1px solid #222;cursor:pointer;background:#000;transition:background .15s"
              onmouseover="this.style.background='#111'"
              onmouseout="this.style.background='#000'"
              onclick="event.stopPropagation();window.switchTab('matches');window.showMatchDetail('${escAttr(m.id)}')">
            <td style="padding:7px 8px;font-size:12px;color:#fff">${escHtml(m.name || '')}</td>
            <td style="padding:7px 8px;text-align:right;font-size:12px;font-weight:700;white-space:nowrap">
              ${mult > 1 ? `<span style="color:#888;text-decoration:line-through;margin-right:4px">${Math.round(total / mult * 10) / 10}</span>` : ''}
              <span style="background:#fff;color:#000;padding:3px 8px;border-radius:999px;font-weight:800">
                ${total > 0 ? '+' : ''}${total}
              </span>
            </td>
          </tr>`;
      }).join('');

      return `
        <div class="player-row" onclick="event.stopPropagation(); togglePlayerMatches(this)"
            style="cursor:pointer;display:flex;align-items:center;gap:10px;${p.isInjured ? 'opacity:.5' : ''}">
          ${p.isInjured ? '<span style="font-size:13px">🩹</span>' : ''}
          
          <img src="${p.playerImg ? escAttr(p.playerImg) : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=64748b&bold=true`}"
              onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e2e8f0&color=64748b&bold=true'"
              style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--bdr)"/>
          
          <div class="flex-1">
            <div class="${p.isInjured ? 'txt-dim' : 'txt-main'} fw-600"
                style="font-size:14px;${p.isInjured ? 'text-decoration:line-through' : ''};display:flex;align-items:center;flex-wrap:wrap">
              ${badgePill}${escHtml(p.name)}
              ${p.role ? `<span style="font-size:10px;color:var(--dim);margin-left:6px;font-weight:600">· ${escHtml(p.role)}</span>` : ''}
              <span class="toggle-arrow" style="margin-left:6px;font-size:10px;color:#9ca3af">▼</span>
            </div>
          </div>

          <span style="color:#7dd3fc;font-weight:700;font-size:15px">${pPts}</span>
        </div>

        <div class="player-matches" style="display:none;padding:10px">
          <div style="font-size:11px;font-weight:800;color:var(--acc);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">
            📅 Match-by-Match History
          </div>

          <div style="background:#000;border-radius:10px;overflow:hidden;border:1px solid #222">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr>
                  <th style="text-align:left;padding:7px 8px;font-size:10px;color:#aaa;text-transform:uppercase;background:#000;border-bottom:1px solid #333;font-weight:600">Fixture</th>
                  <th style="text-align:right;padding:7px 8px;font-size:10px;color:#aaa;text-transform:uppercase;background:#000;border-bottom:1px solid #333;font-weight:600">Pts</th>
                </tr>
              </thead>
              <tbody>
                ${matchRows
            ? matchRows
            : `<tr><td colspan="2" style="color:#666;font-size:11px;padding:8px;background:#000">No points yet</td></tr>`
          }
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    let open = false;
    row.onclick = () => {
      open = !open;
      detail.style.display = open ? 'block' : 'none';
      const arr = document.getElementById('arrow-' + i);
      if (arr) arr.textContent = open ? '▲' : '▼';
    };

    standList.appendChild(row);
    standList.appendChild(detail);
  });
}

// ── Toggle helpers (called from inline onclick) ───
export function toggleStats(row) {
  const next = row.nextElementSibling;
  if (!next) return;
  const open = next.style.display === 'block';
  next.style.display = open ? 'none' : 'block';
  const arrow = row.querySelector('.toggle-arrow');
  if (arrow) arrow.textContent = open ? '▼' : '▲';
}

export function togglePlayerMatches(row) {
  const box = row.nextElementSibling;
  if (!box) return;
  const isOpen = box.style.display === 'block';
  box.style.display = isOpen ? 'none' : 'block';
  const arrow = row.querySelector('.toggle-arrow');
  if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
}