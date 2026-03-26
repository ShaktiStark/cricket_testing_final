// ═══════════════════════════════════════════════════
// STATE — single source of truth
// ═══════════════════════════════════════════════════
export const state = {
  user:        null,
  page:        'login',
  prevPage:    null,
  tournaments: [],
  tId:         null,
  matchDetailOpen: false,
  wiz: { tName: '', sid: '', parsedTeams: [], suggestions: {}, choices: {} }
};

export function getTournament() {
  return state.tournaments.find(t => t.id === state.tId);
}

export function saveState() {
  // local storage caching removed
}
