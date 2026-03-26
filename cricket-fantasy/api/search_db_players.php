<?php
// ── search_db_players.php ─────────────────────────────────────────────────────
// GET ?q=virat  → returns up to 10 player records from the DB
// Used by the wizard Resolve step for manual player selection
// ─────────────────────────────────────────────────────────────────────────────
require 'db.php';
header('Content-Type: application/json');

$q = trim($_GET['q'] ?? '');
if (strlen($q) < 2) {
  echo json_encode(['status' => 'ok', 'results' => []]);
  exit;
}

$like = '%' . $q . '%';
$stmt = $pdo->prepare("
  SELECT DISTINCT name, player_img, role, country, team_name AS team, team_img, external_id
  FROM known_players
  WHERE name LIKE ?
  ORDER BY name ASC
  LIMIT 10
");
$stmt->execute([$like]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
  'status'  => 'ok',
  'results' => array_values($rows)
]);
