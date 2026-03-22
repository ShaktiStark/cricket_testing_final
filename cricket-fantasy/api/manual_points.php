<?php
// ── manual_points.php ────────────────────────────────────────────────────────
// Apply bonus/penalty points scoped to a specific tournament.
// POST body:
//   Player: { "type":"player", "tournament_id":1, "player_id":42,
//              "match_id":"uuid", "points":100, "category":"bowling", "reason":"MOM" }
//   Team:   { "type":"team",   "tournament_id":1, "team_id":5,
//              "points":50, "reason":"Win bonus" }
// ─────────────────────────────────────────────────────────────────────────────
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);
if(!$body){ http_response_code(400); echo json_encode(['status'=>'failure','reason'=>'Invalid JSON']); exit; }

$type = $body['type']   ?? 'player';
$pts  = (int)($body['points'] ?? 0);
$tid  = (int)($body['tournament_id'] ?? 0);

if(!$pts){ echo json_encode(['status'=>'failure','reason'=>'Points cannot be 0']); exit; }

$colMap = ['batting'=>'batting_points','bowling'=>'bowling_points','fielding'=>'fielding_points'];

try{
  if($type === 'player'){
    $playerId = (int)($body['player_id'] ?? 0);
    $matchId  = trim($body['match_id']   ?? '');
    $cat      = $body['category'] ?? 'bowling';
    $col      = $colMap[$cat] ?? 'bowling_points';

    if(!$playerId){ echo json_encode(['status'=>'failure','reason'=>'Missing player_id']); exit; }

    // Verify this player belongs to this tournament (isolation check)
    $check = $pdo->prepare(
      'SELECT p.id, p.name, p.total_points, p.match_points
       FROM players p
       JOIN teams t ON t.id = p.team_id
       WHERE p.id = ? AND t.tournament_id = ?'
    );
    $check->execute([$playerId, $tid]);
    $player = $check->fetch();

    if(!$player){
      echo json_encode(['status'=>'failure','reason'=>'Player not found in this tournament']); exit;
    }

    $mp = !empty($player['match_points']) ? json_decode($player['match_points'], true) : [];

    if($matchId){
      // ── Use correct nested structure matching frontend expectation ──────────
      // Frontend reads: pts.batting.points, pts.bowling.points, pts.bonus.manual
      // Old code stored flat: pts.batting = 100  ← WRONG
      // New code stores nested: pts.batting.points = 100  ← CORRECT
      $cur = $mp[$matchId] ?? [
        'batting'  => ['points'=>0,'runs'=>0,'balls'=>0,'strikeRate'=>0,'fours'=>0,'sixes'=>0],
        'bowling'  => ['points'=>0,'wickets'=>0,'overs'=>0,'economy'=>0],
        'fielding' => ['points'=>0,'catches'=>0,'runouts'=>0,'stumpings'=>0],
        'bonus'    => ['milestone'=>0,'mom'=>0,'manual'=>0]
      ];

      // Safety: upgrade old flat structure to nested if needed
      foreach(['batting','bowling','fielding'] as $c){
        if(!is_array($cur[$c])){
          $cur[$c] = ['points' => (int)($cur[$c] ?? 0)];
        }
      }
      if(!is_array($cur['bonus'])){
        $cur['bonus'] = ['milestone'=>0,'mom'=>0,'manual'=>0];
      }
      if(!isset($cur['bonus']['manual'])) $cur['bonus']['manual'] = 0;

     // Apply points to correct category
      if($cat === 'batting' || $cat === 'bowling' || $cat === 'fielding'){
        $cur[$cat]['points'] = ($cur[$cat]['points'] ?? 0) + $pts;
      } elseif($cat === 'mom' || stripos($body['reason'] ?? '', 'man of the match') !== false) {
        // MOM goes into bonus.mom so frontend displays it correctly
        $cur['bonus']['mom'] = ($cur['bonus']['mom'] ?? 0) + $pts;
      } else {
        $cur['bonus']['manual'] = ($cur['bonus']['manual'] ?? 0) + $pts;
      }

      $mp[$matchId] = $cur;
    }

    $pdo->prepare(
      "UPDATE players SET total_points=total_points+?, {$col}={$col}+?, match_points=? WHERE id=?"
    )->execute([$pts, $pts, json_encode($mp, JSON_UNESCAPED_SLASHES), $playerId]);

    echo json_encode([
      'status'    => 'success',
      'player'    => $player['name'],
      'points'    => $pts,
      'new_total' => $player['total_points'] + $pts,
    ]);

  } elseif($type === 'team'){
    $teamId = (int)($body['team_id'] ?? 0);
    if(!$teamId){ echo json_encode(['status'=>'failure','reason'=>'Missing team_id']); exit; }

    // Verify team belongs to this tournament
    $check = $pdo->prepare('SELECT id FROM teams WHERE id=? AND tournament_id=?');
    $check->execute([$teamId, $tid]);
    if(!$check->fetch()){
      echo json_encode(['status'=>'failure','reason'=>'Team not found in this tournament']); exit;
    }

    $pList = $pdo->prepare(
      'SELECT id FROM players WHERE team_id=? AND is_injured=0'
    );
    $pList->execute([$teamId]);
    $affected = 0;
    $upd = $pdo->prepare('UPDATE players SET total_points=total_points+? WHERE id=?');
    foreach($pList->fetchAll() as $p){
      $upd->execute([$pts, $p['id']]);
      $affected++;
    }

    echo json_encode(['status'=>'success','players_updated'=>$affected,'points_each'=>$pts]);

  } else {
    echo json_encode(['status'=>'failure','reason'=>'Unknown type']);
  }

} catch(Exception $e){
  http_response_code(500);
  echo json_encode(['status'=>'failure','reason'=>$e->getMessage()]);
}