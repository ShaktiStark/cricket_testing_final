// ═══════════════════════════════════════════════════
// RESOLVE — confirm/correct player name matches
// Enhanced to show team badge, role, country from DB
// + Manual "Search DB" box for unknown/unmatched names
// ═══════════════════════════════════════════════════
import { state }               from './state.js';
import { escHtml, escAttr, escId } from './utils.js';
import { goPage }              from './navigation.js';

// ── Debounce timers per input ─────────────────────
const _debounceTimers = {};

export function renderResolve() {
  const container = document.getElementById('resolve-items');
  container.innerHTML = '';

  const dbResults   = state.wiz.dbResults   || {};
  const suggestions = state.wiz.suggestions  || {};
  const allEntries  = Object.entries(suggestions);

  if (!allEntries.length) {
    container.innerHTML = `
      <div class="alert alert-ok">
        ✅ All player names matched exactly — nothing to confirm.
      </div>`;
    updateResolveBtn();
    return;
  }

  allEntries.forEach(([orig, suggs]) => {
    const result    = dbResults[orig] || {};
    const isUnknown = suggs.length === 0;
    const isAuto    = result.status === 'auto';

    const card        = document.createElement('div');
    card.className    = 'card mb-16';
    card.style.border = isUnknown
      ? '1px solid rgba(248,113,113,.3)'
      : '1px solid rgba(251,191,36,.25)';

    // ── Status badge ──────────────────────────────
    const statusBadge = isUnknown
      ? `<span class="badge" style="background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.35);color:var(--err)">✖ Unknown</span>`
      : isAuto
        ? `<span class="badge" style="background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.35);color:#a78bfa">⬆ Auto-matched</span>`
        : `<span class="badge" style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--warn)">⚠ Needs confirm</span>`;

    // ── Suggestion pills ──────────────────────────
    const pills = suggs.map(s => renderPill(orig, s)).join('');

    const keepSelected = state.wiz.choices[orig]?.name === orig;
    const currentChoice = state.wiz.choices[orig];

    card.innerHTML = `
      <div class="flex items-center gap-14 mb-12" style="flex-wrap:wrap">
        <div style="font-size:18px">${isUnknown ? '❓' : '⚠️'}</div>
        <div class="flex-1">
          <div class="txt-dim fs-11">From Excel:</div>
          <div class="fw-800" style="font-size:15px;color:${isUnknown ? 'var(--err)' : 'var(--warn)'}">"${escHtml(orig)}"</div>
        </div>
        ${statusBadge}
      </div>

      ${!isUnknown ? `
        <div class="txt-dim fs-12 mb-8">Select correct player or search below:</div>
        <div class="flex" style="flex-wrap:wrap;gap:8px;margin-bottom:10px" id="pills-${escId(orig)}">
          ${pills}
        </div>` : `
        <div class="alert alert-err mb-12" style="font-size:12px">
          ❌ No match found. Search the database below to find the correct player.
        </div>`}

      <div class="txt-dim fs-12 mb-6">🔍 Search database:</div>
      <div style="position:relative;margin-bottom:10px">
        <input
          class="inp"
          id="search-${escId(orig)}"
          placeholder="Type player name to search..."
          autocomplete="off"
          style="width:100%;padding-right:36px"
          oninput="dbSearchInput('${escAttr(orig)}', this.value)"
          value="${currentChoice && currentChoice.name !== orig && !suggs.find(s=>s.name===currentChoice.name) ? escHtml(currentChoice.name) : ''}"
        />
        <span id="search-spinner-${escId(orig)}" style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--dim)">⏳</span>
      </div>
      <div id="search-results-${escId(orig)}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"></div>

      <div class="flex" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="name-pill keep-orig ${keepSelected ? 'selected' : ''}"
          onclick="pickName('${escId(orig)}','${escAttr(orig)}','__KEEP__')">
          Keep "${escHtml(orig)}"
        </button>
        <div id="choice-bar-${escId(orig)}"
          style="display:${currentChoice && currentChoice.name !== orig ? 'flex' : 'none'};align-items:center;gap:8px;padding:6px 12px;border-radius:8px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);font-size:12px;color:#34d399">
          ${currentChoice && currentChoice.name !== orig ? `
            <img src="${escHtml(currentChoice.playerImg || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentChoice.name)}&background=1e293b&color=94a3b8`)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(currentChoice.name)}&background=1e293b&color=94a3b8'"
                 style="width:22px;height:22px;border-radius:50%;object-fit:cover"/>
            <span>✔ <strong>${escHtml(currentChoice.name)}</strong>${currentChoice.team ? ` · ${escHtml(currentChoice.team)}` : ''}${currentChoice.role ? ` · ${escHtml(currentChoice.role)}` : ''}</span>
          ` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  updateResolveBtn();
}

function renderPill(orig, s) {
  const isSelected = state.wiz.choices[orig]?.name === s.name;
  const teamInfo   = s.team
    ? `<div style="font-size:10px;color:var(--dim);margin-top:3px">
        ${s.teamImg ? `<img src="${escHtml(s.teamImg)}" style="width:14px;height:14px;border-radius:50%;vertical-align:middle;margin-right:3px"/>` : ''}
        ${escHtml(s.team)} · ${escHtml(s.role || '')} · ${escHtml(s.country || '')}
       </div>`
    : '';
  return `
    <button class="name-pill ${isSelected ? 'selected' : ''}"
      onclick="pickName('${escId(orig)}','${escAttr(orig)}','${escAttr(s.name)}')">
      <div>${escHtml(s.name)}
        ${s.score !== undefined ? `<span style="color:var(--dim);font-size:10px;margin-left:4px">${Math.round((s.score||0) * 100)}%</span>` : ''}
      </div>
      ${teamInfo}
    </button>`;
}

// ── Live DB search ────────────────────────────────
export function dbSearchInput(orig, rawValue) {
  const q = rawValue.trim();
  const safeid = escId(orig);
  const spinner = document.getElementById(`search-spinner-${safeid}`);
  const resultsEl = document.getElementById(`search-results-${safeid}`);

  if (q.length < 2) {
    if (resultsEl) resultsEl.innerHTML = '';
    return;
  }

  // Debounce
  clearTimeout(_debounceTimers[orig]);
  if (spinner) spinner.style.display = 'inline';

  _debounceTimers[orig] = setTimeout(async () => {
    try {
      const res  = await fetch(`api/search_db_players.php?q=${encodeURIComponent(q)}&t=${Date.now()}`);
      const json = await res.json();

      if (spinner) spinner.style.display = 'none';
      if (!resultsEl) return;

      const hits = json.results || [];
      if (!hits.length) {
        resultsEl.innerHTML = `<span style="font-size:12px;color:var(--dim)">No players found for "${escHtml(q)}"</span>`;
        return;
      }

      resultsEl.innerHTML = hits.map(h => {
        const isSelected = state.wiz.choices[orig]?.name === h.name;
        const playerJson = escAttr(JSON.stringify(h));
        return `
          <button class="name-pill ${isSelected ? 'selected' : ''}"
            data-orig="${escAttr(orig)}"
            data-player="${playerJson}"
            onclick="pickNameFromSearch(this)">
            <div style="display:flex;align-items:center;gap:6px">
              <img src="${escHtml(h.player_img || `https://ui-avatars.com/api/?name=${encodeURIComponent(h.name)}&background=1e293b&color=94a3b8`)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(h.name)}&background=1e293b&color=94a3b8'" style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
              <div>
                <div>${escHtml(h.name)}</div>
                <div style="font-size:10px;color:var(--dim)">${h.team ? escHtml(h.team) : ''} ${h.role ? '· '+escHtml(h.role) : ''} ${h.country ? '· '+escHtml(h.country) : ''}</div>
              </div>
            </div>
          </button>`;
      }).join('');
    } catch(e) {
      if (spinner) spinner.style.display = 'none';
      console.warn('DB player search failed:', e.message);
    }
  }, 280);
}

// ── Pick from live search ─────────────────────────
export function pickNameFromSearch(btn) {
  try {
    const orig   = btn.dataset.orig;
    const player = JSON.parse(btn.dataset.player);

    // Toggle: clicking the same player again deselects
    if (state.wiz.choices[orig]?.name === player.name) {
      delete state.wiz.choices[orig];
    } else {
      state.wiz.choices[orig] = {
        name:       player.name,
        playerImg:  player.player_img || '',
        role:       player.role       || '',
        country:    player.country    || '',
        team:       player.team       || '',
        teamImg:    player.team_img   || '',
        externalId: player.external_id || '',
      };
    }

    // In-place update: highlight this pill and dim others in the SAME results list
    const resultsEl = btn.closest('[id^="search-results-"]');
    if (resultsEl) {
      resultsEl.querySelectorAll('.name-pill').forEach(p => {
        const pPlayer = JSON.parse(p.dataset.player || '{}');
        p.classList.toggle('selected', pPlayer.name === (state.wiz.choices[orig]?.name));
      });
    }

    // Update the "current choice" confirmation bar below the search box
    const safeid = escId(orig);
    const choiceBar = document.getElementById(`choice-bar-${safeid}`);
    const cur = state.wiz.choices[orig];
    if (choiceBar) {
      if (cur && cur.name !== orig) {
        choiceBar.style.display = 'flex';
        choiceBar.innerHTML = `
          <img src="${escHtml(cur.playerImg || `https://ui-avatars.com/api/?name=${encodeURIComponent(cur.name)}&background=1e293b&color=94a3b8`)}" 
               onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(cur.name)}&background=1e293b&color=94a3b8'"
               style="width:22px;height:22px;border-radius:50%;object-fit:cover"/>
          <span>✔ <strong>${escHtml(cur.name)}</strong>${cur.team ? ` · ${escHtml(cur.team)}` : ''}${cur.role ? ` · ${escHtml(cur.role)}` : ''}</span>`;
      } else {
        choiceBar.style.display = 'none';
        choiceBar.innerHTML = '';
      }
    }

    // Also update keep-orig pill selected state if applicable
    const keepBtn = document.querySelector(`button[onclick*="__KEEP__"][onclick*="${CSS.escape(safeid)}"]`);
    if (keepBtn) keepBtn.classList.toggle('selected', !cur || cur.name === orig);

    updateResolveBtn();
  } catch(e) {
    console.warn('pickNameFromSearch error:', e);
  }
}

export function pickName(escapedOrig, orig, chosenName) {
  if (chosenName === '__KEEP__') {
    state.wiz.choices[orig] = { name: orig };
  } else {
    const suggs = state.wiz.suggestions[orig] || [];
    const found = suggs.find(s => s.name === chosenName);
    state.wiz.choices[orig] = found || { name: chosenName };
  }
  renderResolve();
  updateResolveBtn();
}

export function setCustomName(orig, value) {
  const val = value.trim() || orig;
  state.wiz.choices[orig] = { name: val };
  updateResolveBtn();
}

export function updateResolveBtn() {
  const entries = Object.entries(state.wiz.suggestions || {});
  const allDone = entries.every(([o]) => !!state.wiz.choices[o]);
  const btn     = document.getElementById('resolve-confirm-btn');
  const hint    = document.getElementById('resolve-hint');
  if (btn)  btn.disabled       = !allDone;
  if (hint) hint.style.display = allDone ? 'none' : 'block';
}

export function resolveConfirm() { goPage('preview'); }
export function resolveSkip() {
  Object.keys(state.wiz.suggestions || {}).forEach(orig => {
    if (!state.wiz.choices[orig]) state.wiz.choices[orig] = { name: orig };
  });
  goPage('preview');
}
