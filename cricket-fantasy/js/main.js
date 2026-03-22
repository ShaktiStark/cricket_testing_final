// ═══════════════════════════════════════════════════
// MAIN — entry point, wires all modules, exposes globals
// ═══════════════════════════════════════════════════

// ── Core ──────────────────────────────────────────
import { state, getTournament }           from './state.js';
import { loadTournamentsFromServer }      from './api.js';

// ── Navigation ────────────────────────────────────
import { goPage, navBack, switchTab,
         registerRenderer }              from './navigation.js';

// ── Auth ──────────────────────────────────────────
import { playerLogin, showAdminForm,
         backToChoose, doAdminLogin,
         logout }                        from './auth.js';

// ── Tournament / home ─────────────────────────────
import { renderUserHome, renderAdminHome,
         openTournament, goNewTournament,
         deleteTournament,
         deleteTournamentClick,
         updateTournament }              from './tournament.js';

// ── Wizard ────────────────────────────────────────
import { renderNewTournament, wizNext,
         handleWizFile, handleWizDrop }  from './wizard.js';

// ── Resolve ───────────────────────────────────────
import { renderResolve, pickName,
         resolveConfirm, resolveSkip,setCustomName }   from './resolve.js';

// ── Preview ───────────────────────────────────────
import { renderPreview, createTournament } from './preview.js';

// ── Leaderboard ───────────────────────────────────
import { renderLeaderboard,
         toggleStats, togglePlayerMatches } from './leaderboard.js';

// ── Matches ───────────────────────────────────────
import { renderMatchesList,
         showMatchDetail,
         renderFantasyPoints }           from './matches.js';

// ── Manage ────────────────────────────────────────
import { renderManage, switchSubTab,
         saveApiKeysFromUI,
         fetchSeriesMatches, fetchScores,
         triggerNightlySync,
         renderSubScores, renderSubInjury,
         renderSubManual,
         applyManualPoints, applyTeamAward,
         applyTournamentAward,
         fillManualPreset,
         updateInjuryPlayers,filterManualPlayers,
         processInjury }                from './manage.js';

// ── Captain ───────────────────────────────────────
import { renderSubCaptain, saveCaptain,
         deleteCaptainEntry,
         onCapWeekChange,
         updateCaptainPlayers,
         setCaptainSavedCallback }       from './captain.js';

// ── Modal ─────────────────────────────────────────
const modal = document.getElementById('rulesModal');
function openModal()  { if (modal) { modal.style.display = 'block'; document.body.style.overflow = 'hidden'; } }
function closeModal() { if (modal) { modal.style.display = 'none';  document.body.style.overflow = 'auto';   } }
window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

// ══════════════════════════════════════════════════
// TOURNAMENT VIEW — top-level render that stitches
// leaderboard + matches + manage together
// ══════════════════════════════════════════════════
function renderTournamentContent() {
  const t = getTournament();
  if (!t) return;
  document.getElementById('tab-btn-manage').style.display = state.user === 'admin' ? 'block' : 'none';
  renderLeaderboard(t);
  renderMatchesList(t);
  if (state.user === 'admin') renderManage(t);
  switchTab(window._currentTab || 'leaderboard');
}

// Expose for cross-module call from tournament.js (avoids circular imports)
window._renderTournamentContent = renderTournamentContent;

// ── Captain → leaderboard refresh wiring ─────────
setCaptainSavedCallback(() => {
  renderSubCaptain(getTournament());
  renderLeaderboard(getTournament());
});

// ── Page renderers registered in the nav system ───
registerRenderer('user-home',      renderUserHome);
registerRenderer('admin-home',     renderAdminHome);
registerRenderer('new-tournament', renderNewTournament);
registerRenderer('resolve',        renderResolve);
registerRenderer('preview',        renderPreview);
registerRenderer('tournament',     renderTournamentContent);

// ══════════════════════════════════════════════════
// GLOBAL WINDOW EXPORTS
// All functions referenced by inline HTML onclick=
// must live on window when using ES modules.
// ══════════════════════════════════════════════════
Object.assign(window, {
  // auth
  playerLogin, showAdminForm, backToChoose, doAdminLogin, logout,

  // navigation
  goPage, navBack, switchTab,

  // tournament
  openTournament, goNewTournament, deleteTournament, deleteTournamentClick,
  updateTournament,   // needed by captain.js fallback path

  // wizard
  handleWizFile, handleWizDrop, wizNext,

  // resolve
  pickName, resolveConfirm, resolveSkip,
  setCustomName,

  // preview
  createTournament,

  // leaderboard / matches
  toggleStats, togglePlayerMatches,
  showMatchDetail, renderMatchesList,
  renderLeaderboard,

  // manage
  switchSubTab, saveApiKeysFromUI,
  fetchSeriesMatches, fetchScores, triggerNightlySync,
  applyManualPoints, applyTeamAward, applyTournamentAward,
  fillManualPreset, updateInjuryPlayers, processInjury,filterManualPlayers,

  // captain
  saveCaptain, deleteCaptainEntry, onCapWeekChange, updateCaptainPlayers,

  // modal
  openModal, closeModal, toggleStats,

  // state (needed by inline onclick="state.matchDetailOpen=false" etc.)
  state, getTournament,
});

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
loadTournamentsFromServer().then(() => {
  goPage(state.page || 'login');
});
