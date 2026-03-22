<?php
// ── save_known_players.php ────────────────────────────────────────────────────
// Bulk-imports IPL / tournament squad data into the known_players table.
//
// POST body (JSON):
// {
//   "source": "IPL2025",          ← optional tag so you can re-import per season
//   "replace": true,              ← if true, DELETE existing rows for this source first
//   "data": [                     ← array of team objects (CricAPI squad format)
//     {
//       "teamName": "Mumbai Indians",
//       "shortname": "MI",
//       "img": "https://...",
//       "players": [
//         { "id": "uuid", "name": "Rohit Sharma", "role": "Batsman",
//           "battingStyle": "...", "bowlingStyle": "...",
//           "country": "India", "playerImg": "https://..." },
//         ...
//       ]
//     },
//     ...
//   ]
// }
//
// Can also be called as GET with ?source=IPL2025&action=list  to list known sources.
// ─────────────────────────────────────────────────────────────────────────────
require 'db.php';

// ── Ensure table exists ───────────────────────────────────────────────────────
$pdo->exec("
  CREATE TABLE IF NOT EXISTS known_players (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    external_id     VARCHAR(255)  DEFAULT NULL,
    name            VARCHAR(255)  NOT NULL,
    name_normalized VARCHAR(255)  NOT NULL,
    team_name       VARCHAR(255)  DEFAULT NULL,
    team_shortname  VARCHAR(20)   DEFAULT NULL,
    team_img        VARCHAR(512)  DEFAULT NULL,
    role            VARCHAR(100)  DEFAULT NULL,
    batting_style   VARCHAR(100)  DEFAULT NULL,
    bowling_style   VARCHAR(100)  DEFAULT NULL,
    country         VARCHAR(100)  DEFAULT NULL,
    player_img      VARCHAR(512)  DEFAULT NULL,
    source          VARCHAR(100)  DEFAULT 'manual',
    created_at      BIGINT        DEFAULT 0,
    updated_at      BIGINT        DEFAULT 0,
    INDEX idx_name_norm (name_normalized),
    INDEX idx_external_id (external_id),
    INDEX idx_team (team_name),
    UNIQUE KEY uq_ext_team (external_id, team_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ── Utility ───────────────────────────────────────────────────────────────────
function normalizeName(string $s): string {
  return strtolower(preg_replace('/[^a-z]/i', '', $s));
}

// ── GET: list sources ─────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $action = $_GET['action'] ?? '';
  if ($action === 'list') {
    $rows = $pdo->query(
      "SELECT source, COUNT(*) AS player_count FROM known_players GROUP BY source ORDER BY source"
    )->fetchAll();
    echo json_encode(['status' => 'success', 'sources' => $rows]);
  } else {
    $total = $pdo->query("SELECT COUNT(*) FROM known_players")->fetchColumn();
    echo json_encode(['status' => 'success', 'total_players' => $total,
      'hint' => 'POST JSON body with {source, replace, data:[{teamName, players:[]}]}']);
  }
  exit;
}

// ── POST: import ──────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);

if (!$body || !isset($body['data']) || !is_array($body['data'])) {
  http_response_code(400);
  echo json_encode(['status' => 'failure', 'reason' => 'Expected {source, replace, data:[...]}']);
  exit;
}

$source  = trim($body['source']  ?? 'manual');
$replace = !empty($body['replace']);
$now     = time();

try {
  $pdo->beginTransaction();

  // Optionally wipe existing entries for this source (clean re-import)
  if ($replace) {
    $pdo->prepare('DELETE FROM known_players WHERE source = ?')->execute([$source]);
  }

  $stmt = $pdo->prepare("
    INSERT INTO known_players
      (external_id, name, name_normalized, team_name, team_shortname, team_img,
       role, batting_style, bowling_style, country, player_img, source, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      name            = VALUES(name),
      name_normalized = VALUES(name_normalized),
      team_shortname  = VALUES(team_shortname),
      team_img        = VALUES(team_img),
      role            = VALUES(role),
      batting_style   = VALUES(batting_style),
      bowling_style   = VALUES(bowling_style),
      country         = VALUES(country),
      player_img      = VALUES(player_img),
      source          = VALUES(source),
      updated_at      = VALUES(updated_at)
  ");

  $inserted = 0;
  $skipped  = 0;
  $errors   = [];

  foreach ($body['data'] as $team) {
    $teamName      = trim($team['teamName']  ?? '');
    $teamShortname = trim($team['shortname'] ?? '');
    $teamImg       = trim($team['img']       ?? '');

    foreach (($team['players'] ?? []) as $p) {
      $name = trim($p['name'] ?? '');
      if (!$name) { $skipped++; continue; }

      try {
        $stmt->execute([
          $p['id']           ?? null,
          $name,
          normalizeName($name),
          $teamName,
          $teamShortname,
          $teamImg,
          $p['role']          ?? null,
          $p['battingStyle']  ?? null,
          $p['bowlingStyle']  ?? null,
          $p['country']       ?? null,
          $p['playerImg']     ?? null,
          $source,
          $now,
          $now
        ]);
        $inserted++;
      } catch (Exception $e) {
        $errors[] = "Player '{$name}' (team {$teamName}): " . $e->getMessage();
        $skipped++;
      }
    }
  }

  $pdo->commit();
  echo json_encode([
    'status'   => 'success',
    'source'   => $source,
    'inserted' => $inserted,
    'skipped'  => $skipped,
    'errors'   => $errors
  ], JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
  $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['status' => 'failure', 'reason' => $e->getMessage()]);
}
