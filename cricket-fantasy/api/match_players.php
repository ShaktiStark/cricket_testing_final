<?php
// ── match_players.php ─────────────────────────────────────────────────────────
// Given a list of player names (from Excel upload), finds matches in known_players.
//
// POST body: { "names": ["Rohit Sharma", "Virat Kohly", "xyz123"], "source": "IPL2025" }
// Response:
// {
//   "status": "success",
//   "results": {
//     "Rohit Sharma": { "status": "exact",   "match": { name, team, country, ... } },
//     "Virat Kohly":  { "status": "fuzzy",   "suggestions": [ { name, team, score, ... } ] },
//     "xyz123":       { "status": "unknown", "suggestions": [] }
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);

if (!$body || !isset($body['names']) || !is_array($body['names'])) {
  http_response_code(400);
  echo json_encode(['status' => 'failure', 'reason' => 'Expected { names: [...], source?: "..." }']);
  exit;
}

$inputNames = array_unique(array_filter(array_map('trim', $body['names'])));
$source     = trim($body['source'] ?? ''); // optional — restrict to one source

// ── Utility ───────────────────────────────────────────────────────────────────
function normalizeName(string $s): string {
  return strtolower(preg_replace('/[^a-z]/i', '', $s));
}

// Levenshtein similarity 0–1
function similarity(string $a, string $b): float {
  $maxLen = max(strlen($a), strlen($b));
  if ($maxLen === 0) return 1.0;
  return 1.0 - levenshtein($a, $b) / $maxLen;
}

// ── Load all known players into memory (fast for ≤5000 players) ───────────────
$sql    = $source
  ? 'SELECT * FROM known_players WHERE source = ? ORDER BY name'
  : 'SELECT * FROM known_players ORDER BY name';
$stmt   = $pdo->prepare($sql);
$stmt->execute($source ? [$source] : []);
$allKnown = $stmt->fetchAll();

if (!$allKnown) {
  // Table empty — return unknown for all
  $results = [];
  foreach ($inputNames as $n) $results[$n] = ['status' => 'unknown', 'suggestions' => []];
  echo json_encode(['status' => 'success', 'results' => $results,
    'warning' => 'known_players table is empty. Import player data first.']);
  exit;
}

// ── Match each input name ─────────────────────────────────────────────────────
$EXACT_THRESHOLD = 1.00;  // normalised strings are identical
$AUTO_THRESHOLD  = 0.90;  // high enough to auto-accept without confirmation
$SUGGEST_THRESHOLD = 0.55; // show as a suggestion

$results = [];

foreach ($inputNames as $inputName) {
  $normInput = normalizeName($inputName);
  $exact     = null;
  $candidates = [];

  foreach ($allKnown as $p) {
    $normKnown = $p['name_normalized'];

    // 1. Exact normalized match
    if ($normKnown === $normInput) {
      $exact = $p;
      break;
    }

    // 2. Similarity score
    $score = similarity($normInput, $normKnown);

    // Boost: last-name match
    $partsInput = explode(' ', $normInput);
    $partsKnown = explode(' ', $normKnown);
    $lastInput  = end($partsInput);
    $lastKnown  = end($partsKnown);
    if ($lastInput === $lastKnown && strlen($lastInput) > 3) {
      $score = max($score, 0.82);
    }
    // Boost: first initial + last name (V Kohli vs Virat Kohli)
    if ($lastInput === $lastKnown && strlen($normInput) > 0 && $normInput[0] === $normKnown[0]) {
      $score = max($score, 0.80);
    }

    if ($score >= $SUGGEST_THRESHOLD) {
      $candidates[] = [
        'name'      => $p['name'],
        'team'      => $p['team_name'],
        'shortname' => $p['team_shortname'],
        'teamImg'   => $p['team_img'],
        'role'      => $p['role'],
        'country'   => $p['country'],
        'playerImg' => $p['player_img'],
        'externalId'=> $p['external_id'],
        'source'    => $p['source'],
        'score'     => round($score, 3)
      ];
    }
  }

  // Sort candidates by score desc
  usort($candidates, fn($a, $b) => $b['score'] <=> $a['score']);
  $candidates = array_slice($candidates, 0, 5); // top 5

  if ($exact) {
    $results[$inputName] = [
      'status' => 'exact',
      'match'  => [
        'name'      => $exact['name'],
        'team'      => $exact['team_name'],
        'shortname' => $exact['team_shortname'],
        'teamImg'   => $exact['team_img'],
        'role'      => $exact['role'],
        'country'   => $exact['country'],
        'playerImg' => $exact['player_img'],
        'externalId'=> $exact['external_id'],
        'source'    => $exact['source'],
        'score'     => 1.0
      ]
    ];
  } elseif (!empty($candidates) && $candidates[0]['score'] >= $AUTO_THRESHOLD) {
    // Very high confidence — mark as auto but still show for review
    $results[$inputName] = [
      'status'      => 'auto',   // will be auto-accepted by wizard unless user changes
      'suggestions' => $candidates
    ];
  } elseif (!empty($candidates)) {
    $results[$inputName] = [
      'status'      => 'fuzzy',
      'suggestions' => $candidates
    ];
  } else {
    $results[$inputName] = [
      'status'      => 'unknown',
      'suggestions' => []
    ];
  }
}

echo json_encode([
  'status'  => 'success',
  'results' => $results,
  'stats'   => [
    'total'   => count($inputNames),
    'exact'   => count(array_filter($results, fn($r) => $r['status'] === 'exact')),
    'auto'    => count(array_filter($results, fn($r) => $r['status'] === 'auto')),
    'fuzzy'   => count(array_filter($results, fn($r) => $r['status'] === 'fuzzy')),
    'unknown' => count(array_filter($results, fn($r) => $r['status'] === 'unknown'))
  ]
], JSON_UNESCAPED_SLASHES);
