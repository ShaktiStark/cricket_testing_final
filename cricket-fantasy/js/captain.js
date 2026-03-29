// ═══════════════════════════════════════════════════
// CAPTAIN — weekly captain & vice-captain management
// ═══════════════════════════════════════════════════
import { getTournament } from './state.js';
import { updateTournament } from './tournament.js';
import { escHtml, norm } from './utils.js';
import {
  weekKey, weekLabel,
  weekKeyFromInput,
  getISOWeekNum
} from './week.js';
import { toast } from './utils.js';

// Called after any captain change to refresh leaderboard too.
let _onCaptainSaved = () => { };
export function setCaptainSavedCallback(fn) { _onCaptainSaved = fn; }

// ── Render the entire captain sub-panel ──────────
export function renderSubCaptain(t) {
  const el = document.getElementById('sub-captain');
  const wc = t.weeklyCaptains || {};
  const weeks = Object.keys(wc).sort().reverse();

  const todayKey = weekKey(new Date());
  const todayWeekNum = String(getISOWeekNum(new Date())).padStart(2, '0');
  const todayYear = new Date().getFullYear();

  const historyRows = weeks.flatMap(wk =>
    Object.entries(wc[wk] || {}).map(([teamId, sel]) => {
      const team = (t.teams || []).find(x => String(x.id) === String(teamId));
      const cap = (team?.players || []).find(p => String(p.id) === String(sel.captain));
      const vc = (team?.players || []).find(p => String(p.id) === String(sel.vc));
      if (!cap) return '';
      return `
        <div class="cap-history-row">
          <div class="cap-history-info">
            <div class="cap-meta">${escHtml(weekLabel(wk))} · ${escHtml(team?.owner || team?.name || '')}</div>
            <div class="cap-tags">
              <span class="cap-tag captain">⭐ C: ${escHtml(cap?.name || '')}</span>
              <span class="cap-tag vc">🔰 VC: ${escHtml(vc?.name || sel.vc)}</span>
            </div>
          </div>
          <button class="cap-delete" onclick="deleteCaptainEntry('${escHtml(wk)}','${teamId}')">✕</button>
        </div>`;
    })
  ).join('');
  const prevTeamSel = document.getElementById('cap-team');
  let selectedTeamId = t.teams?.[0]?.id || '';
  if (prevTeamSel && prevTeamSel.value) {
    if ((t.teams || []).find(x => String(x.id) === String(prevTeamSel.value))) {
      selectedTeamId = prevTeamSel.value;
    } else {
      const prevText = prevTeamSel.options[prevTeamSel.selectedIndex]?.text || '';
      const prevName = prevText.split(' (')[0].trim();
      const matched = (t.teams || []).find(tm => tm.name.trim() === prevName);
      if (matched) selectedTeamId = matched.id;
    }
  }
  el.innerHTML = `
  <div class="card">
    <div class="section-title">Weekly Captain &amp; Vice-Captain</div>
    <div class="cap-info-box">
      Captain earns <b>2×</b> points · Vice-captain earns <b>1.5×</b> points.
      Applied only to matches played within that <b>Mon–Sun week</b>.
    </div>
    <div class="grid-2">
     <div>
        <label class="form-label">Week (Mon–Sun)</label>
        <div style="position:relative;cursor:pointer" onclick="document.getElementById('cap-week-input').showPicker?.() || document.getElementById('cap-week-input').click()">
          <div class="inp" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
            <span id="cap-week-label-display">${weekLabel(todayKey)}</span>
            <span style="color:var(--acc);font-size:16px">📅</span>
          </div>
          <input type="week" id="cap-week-input"
            value="${todayYear}-W${todayWeekNum}"
            onchange="onCapWeekChange()"
            style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer"/>
        </div>
        <div id="cap-week-label" class="meta-text">${weekLabel(todayKey)}</div>
      </div>
      <div>
        <label class="form-label">Fantasy Team</label>
        <select class="inp" id="cap-team" onchange="onTeamChange()">
          ${(t.teams || []).map((tm) =>
            `<option value="${tm.id}" ${String(tm.id) === String(selectedTeamId) ? 'selected' : ''}>
              ${escHtml(tm.name)}
              ${tm.owner && norm(tm.owner) !== norm(tm.name)
                ? ' (' + escHtml(tm.owner) + ')'
                : ''}
            </option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="grid-2 mt">
      <div>
        <label class="form-label captain-label">Captain (2× points)</label>
        <select class="inp" id="cap-player"><option value="">Pick team first</option></select>
      </div>
      <div>
        <label class="form-label vc-label">Vice Captain (1.5× points)</label>
        <select class="inp" id="vc-player"><option value="">Pick team first</option></select>
      </div>
    </div>
    <button class="btn btn-success full mt" onclick="saveCaptain()">Save Captain for this Week</button>
  </div>

  ${weeks.length ? `
  <div class="card mt">
    <div class="section-title">Captain History</div>
    <div class="cap-history-list">
      ${historyRows || '<div class="meta-text">No captains set yet</div>'}
    </div>
  </div>` : ''}
  `;

  requestAnimationFrame(() => {
    const teamSel = document.getElementById('cap-team');

    // ensure correct team stays selected
    if (teamSel && !teamSel.value && teamSel.options.length) {
      teamSel.selectedIndex = 0;
    }

    updateCaptainPlayers();
  });
}

export function onCapWeekChange() {
  const val = document.getElementById('cap-week-input')?.value;
  const key = weekKeyFromInput(val);
  const lbl = document.getElementById('cap-week-label');
  if (lbl) lbl.textContent = weekLabel(key);
  updateCaptainPlayers();
}

export function updateCaptainPlayers() {
  const teamSel = document.getElementById('cap-team');
  const capSel = document.getElementById('cap-player');
  const vcSel = document.getElementById('vc-player');
  const wkVal = document.getElementById('cap-week-input')?.value;

  if (!teamSel || !capSel || !vcSel) return;

  const teamId = String(teamSel.value || '');
  const t = getTournament();

  // ✅ Find team safely (string-safe)
  const team = (t.teams || []).find(x => String(x.id) === teamId);

  // 🔥 ALWAYS RESET FIRST
  capSel.innerHTML = '<option value="">— select player —</option>';
  vcSel.innerHTML = '<option value="">— select player —</option>';

  // ❌ No team selected
  if (!teamId || !team) {
    capSel.innerHTML = '<option value="">— pick team first —</option>';
    vcSel.innerHTML = '<option value="">— pick team first —</option>';
    return;
  }

  // ❌ No players (should NEVER happen now)
  if (!team.players || !team.players.length) {
    console.error("🚨 TEAM HAS NO PLAYERS:", team);
    capSel.innerHTML = '<option value="">— no players found —</option>';
    vcSel.innerHTML = '<option value="">— no players found —</option>';
    return;
  }

  // ✅ Populate players
  const options = team.players.map(p =>
    `<option value="${p.id}">${escHtml(p.name)}</option>`
  ).join('');

  capSel.innerHTML =
    '<option value="">— select player —</option>' + options;

  vcSel.innerHTML =
    '<option value="">— select player —</option>' + options;

  // ✅ Apply saved captain/VC
  const wkKey = weekKeyFromInput(wkVal);

  const existing =
    ((t.weeklyCaptains || {})[wkKey] || {})[teamId] || {};

  if (existing.captain) capSel.value = String(existing.captain);
  if (existing.vc) vcSel.value = String(existing.vc);
}

export async function saveCaptain() {
  const teamId = document.getElementById('cap-team')?.value;
  const capId = document.getElementById('cap-player')?.value;
  const vcId = document.getElementById('vc-player')?.value;
  const wkVal = document.getElementById('cap-week-input')?.value;
  if (!teamId || !capId || !vcId) { alert('Select team, captain and vice-captain'); return; }
  if (capId === vcId) { alert('Captain and Vice-Captain must be different players'); return; }

  const wkKey = weekKeyFromInput(wkVal);
  const t = JSON.parse(JSON.stringify(getTournament()));
  const team = (t?.teams || []).find(x => String(x.id) === String(teamId));
  const cap = (team?.players || []).find(p => String(p.id) === String(capId));
  const vc = (team?.players || []).find(p => String(p.id) === String(vcId));

  const updated = {
    ...t,
    weeklyCaptains: {
      ...(t.weeklyCaptains || {}),
      [wkKey]: { ...((t.weeklyCaptains || {})[wkKey] || {}), [teamId]: { captain: capId, vc: vcId } }
    }
  };
  
  toast(`⏳ Saving Captain...`);
  _onCaptainSaved();
  
  try {
    await updateTournament(updated, true);
    _onCaptainSaved();
    toast(`✅ ${cap?.name || 'Captain'} (C) · ${vc?.name || 'VC'} — Week ${weekLabel(wkKey)}`);
  } catch (e) {
    toast(`❌ Failed to save Captain: ${e.message}`, '#ef4444', '#fff');
  }
}

export function deleteCaptainEntry(wkKey, teamId) {
  if (!confirm('Remove this captain selection?')) return;
  const t = getTournament();
  const newWc = JSON.parse(JSON.stringify(t.weeklyCaptains || {}));
  if (newWc[wkKey]) {
    delete newWc[wkKey][teamId];
    if (!Object.keys(newWc[wkKey]).length) delete newWc[wkKey];
  }
  updateTournament({ ...t, weeklyCaptains: newWc });
  _onCaptainSaved();
}
window.onTeamChange = function () {
  updateCaptainPlayers();
};
// Ensure functions are globally available for inline event handlers
window.updateCaptainPlayers = updateCaptainPlayers;
window.onCapWeekChange = onCapWeekChange;
window.saveCaptain = saveCaptain;
window.deleteCaptainEntry = deleteCaptainEntry;
