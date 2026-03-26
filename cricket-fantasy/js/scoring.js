// ═══════════════════════════════════════════════════
// SCORING — fantasy points calculation engine
// ═══════════════════════════════════════════════════
import { norm, isSamePlayer, parseOvers, normalizeScorecard } from './utils.js';

// ── Batting points ────────────────────────────────
export function calcBat(runs, balls, fours, sixes, sr, duck, notOut = false) {
  const J = duck ? -10 : runs;
  let neg = duck ? -10 : 0;

  // let K = 0;
  // if      (runs >= 200) K = 200;
  // else if (runs >= 150) K = 150;
  // else if (runs >= 125) K = 00;
  // else if (runs >= 75)  K = 75;
  // else if (runs >= 50)  K = 50;
  // else if (runs >= 25)  K = 25;125;
  // else if (runs >= 100) K = 1
  const K = [200, 150, 125, 100, 75, 50, 25].find(t => runs >= t) || 0;

  const L_tiers = [
    { max: 49.99, pts: -60 }, { max: 74.99, pts: -40 },
    { max: 99.99, pts: -20 }, { max: 124.99, pts: -10 },
    { max: 150, pts: 0 }, { max: 175, pts: 10 },
    { max: 200, pts: 20 }, { max: 250, pts: 40 },
    { max: 300, pts: 60 }, { max: 350, pts: 80 },
    { max: Infinity, pts: 100 }
  ];
  const L = L_tiers.find(t => sr <= t.max)?.pts || 0;

  const M = (runs > 20 || balls >= 10) ? L : 0;
  if (M < 0) neg += M;
  const notOutBonus = notOut ? 10 : 0;

  return { total: J + K + M + (fours * 1) + (sixes * 2) + notOutBonus, negative: neg };
}

// ── Bowling points ────────────────────────────────
export function calcBowl(wkts, maidens, runs, oversDec, eco, wides = 0, noballs = 0, lbwBowled = 0) {
  let pts = wkts * 25;
  let neg = 0;

  const wkt_tiers = [
    { min: 8, pts: 175 }, { min: 7, pts: 150 }, { min: 6, pts: 125 },
    { min: 5, pts: 100 }, { min: 4, pts: 75 }, { min: 3, pts: 50 },
    { min: 0, pts: 0 }
  ];
  pts += wkt_tiers.find(t => wkts >= t.min)?.pts || 0;

  pts += lbwBowled * 10;
  pts += maidens * 40;
  neg -= (wides + noballs) * 2;

  if (oversDec >= 2) {
    const eco_tiers = [
      { max: 0.99, pts: 120 }, { max: 1.99,  pts: 80 }, { max: 3.99, pts: 40 },
      { max: 5.99, pts:  20 }, { max: 7.99,  pts: 10 }, { max: 10,   pts:  0 },
      { max: 12,   pts: -10 }, { max: 14,    pts:-20 }, { max: 16,   pts:-40 },
      { max: Infinity, pts: -60 }
    ];
    const ecoBonus = eco_tiers.find(t => eco <= t.max)?.pts || 0;
    pts += ecoBonus;
    if (ecoBonus < 0) neg += ecoBonus;
  }

  return { total: pts, negative: neg };
}

// ── Build the lbw/bowled map for an entire scorecard ──
function buildLbwMap(scorecard) {
  const lbwMap = {};
  (scorecard.innings || []).forEach(inn => {
    (inn.batting || []).forEach(b => {
      const text = (b['dismissal-text'] || '').toLowerCase();
      if (!text.includes('b ')) return;
      const match = text.match(/b\s+([a-z\s]+)/);
      if (!match) return;
      const key = norm(match[1].trim());
      lbwMap[key] = (lbwMap[key] || 0) + 1;
    });
  });
  return lbwMap;
}

// ── Apply one match scorecard to the entire tournament ──
export function applyMatch(tournament, matchInfo, rawScorecard) {
  const scorecard = normalizeScorecard(rawScorecard);
  const mid = matchInfo.id;
  const lbwMap = buildLbwMap(scorecard);

  const updatedTeams = (tournament.teams || []).map(team => ({
    ...team,
    players: (team.players || []).map(player => {
      if (player.isInjured) return player;

      let bat = 0, bowl = 0, field = 0, neg = 0;
      let runs = 0, balls = 0, fours = 0, sixes = 0, sr = 0;
      let wkts = 0, overs = 0, runsConceded = 0, eco = 0, wides = 0, noballs = 0;
      let catches = 0, runouts = 0, stumpings = 0;

      (scorecard.innings || []).forEach(inn => {
        // ── Batting ──────────────────────────────
        (inn.batting || []).forEach(b => {
          if (!isSamePlayer(player.name, b.batsman?.name || '')) return;
          runs += +(b.r || 0);
          balls += +(b.b || 0);
          fours += +(b['4s'] || 0);
          sixes += +(b['6s'] || 0);
          sr = b.sr ? parseFloat(b.sr) : sr;
          const notOut = (b['dismissal-text'] || '').toLowerCase().includes('not out');
          const duck = runs === 0 && balls > 0 && !notOut;
          const batRes = calcBat(runs, balls, fours, sixes, sr, duck, notOut);
          bat = batRes.total; neg += batRes.negative;
        });

        // ── Bowling ──────────────────────────────
        (inn.bowling || []).forEach(bw => {
          if (!isSamePlayer(player.name, bw.bowler?.name || '')) return;
          wkts = +(bw.w || 0);
          overs = parseOvers(bw.o || 0);
          runsConceded = +(bw.r || 0);
          eco = bw.eco ? parseFloat(bw.eco) : 0;
          wides = +(bw.wd || 0);
          noballs = +(bw.nb || 0);
          const lbwBowled = lbwMap[norm(player.name)] || 0;
          const bowlRes = calcBowl(wkts, bw.m || 0, runsConceded, overs, eco, wides, noballs, lbwBowled);
          bowl = bowlRes.total; neg += bowlRes.negative;
        });

        // ── Fielding ─────────────────────────────
        (inn.catching || []).forEach(c => {
          if (!isSamePlayer(player.name, c.catcher?.name || '')) return;
          catches += +(c.catch || 0);
          runouts += +(c.runout || 0);
          stumpings += +(c.stumped || 0);
          field = catches * 10 + runouts * 10 + stumpings * 10;
        });
      });

      const total = bat + bowl + field;
      if (total === 0 && neg === 0) return player;

      const mp = {
        batting: { runs, balls, strikeRate: sr, fours, sixes, points: bat },
        bowling: { wickets: wkts, overs, runs: runsConceded, economy: eco, wides, noballs, points: bowl },
        fielding: { catches, runouts, stumpings, points: field },
        bonus: { milestone: 0, mom: 0 },
        negative: neg
      };

      return {
        ...player,
        matchPoints: { ...(player.matchPoints || {}), [mid]: mp },
        totalPoints: (player.totalPoints || 0) + total,
        battingPoints: (player.battingPoints || 0) + bat,
        bowlingPoints: (player.bowlingPoints || 0) + bowl,
        fieldingPoints: (player.fieldingPoints || 0) + field
      };
    })
  }));

  // ── Update match metadata ─────────────────────
  const newMatches = (tournament.matches || []).some(m => m.id === mid)
    ? tournament.matches.map(m =>
      m.id === mid
        ? {
          ...m, status: 'completed', result: matchInfo.status,
          teamInfo: matchInfo.teamInfo || m.teamInfo || [], isScored: true
        }
        : m
    )
    : [
      ...(tournament.matches || []),
      {
        id: mid, name: matchInfo.name, date: matchInfo.date,
        venue: matchInfo.venue || '', status: 'completed',
        result: matchInfo.status, teamInfo: matchInfo.teamInfo || [], isScored: true
      }
    ];

  return { ...tournament, teams: updatedTeams, matches: newMatches };
}
