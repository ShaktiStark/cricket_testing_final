<?php
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);
if(!$body || !isset($body['id'])){
  http_response_code(400);
  echo json_encode(['status'=>'failure','reason'=>'Missing id']);
  exit;
}

$tId = (int)$body['id'];

if(empty($body['teams'])){
  echo json_encode(['status'=>'failure','reason'=>'Teams data missing — update blocked']);
  exit;
}

try{
  $pdo->beginTransaction();

  // ── 1. Capture OLD team name→id and player name→id BEFORE deleting ──────
  // This is the key fix: teams get new auto-increment IDs on every re-insert,
  // so we remap weeklyCaptains from old IDs → new IDs after re-insert.
  $oldTeamMap   = []; // old_db_id  → team_name
  $oldPlayerMap = []; // old_db_id  → player_name

  $stmt = $pdo->prepare('SELECT id, name FROM teams WHERE tournament_id=?');
  $stmt->execute([$tId]);
  foreach($stmt->fetchAll() as $r){
    $oldTeamMap[(string)$r['id']] = $r['name'];
  }

  $stmt = $pdo->prepare(
    'SELECT p.id, p.name FROM players p
     JOIN teams t ON t.id = p.team_id WHERE t.tournament_id=?'
  );
  $stmt->execute([$tId]);
  foreach($stmt->fetchAll() as $r){
    $oldPlayerMap[(string)$r['id']] = $r['name'];
  }

  // ── 2. Preserve existing match_points + scorecard cache ──────────────────
  $existingPlayers = []; // norm(name) → player row
  $stmt = $pdo->prepare(
    'SELECT p.* FROM players p
     JOIN teams t ON t.id = p.team_id WHERE t.tournament_id=?'
  );
  $stmt->execute([$tId]);
  foreach($stmt->fetchAll() as $p){
    $key = preg_replace('/[^a-z]/','',strtolower($p['name']));
    $existingPlayers[$key] = $p;
  }

  $existingMatches = []; // external_id → {scorecard_raw, is_scored}
  $stmt = $pdo->prepare(
    'SELECT external_id, scorecard_raw, is_scored FROM matches WHERE tournament_id=?'
  );
  $stmt->execute([$tId]);
  foreach($stmt->fetchAll() as $r){
    if($r['external_id']) $existingMatches[$r['external_id']] = $r;
  }

  // ── 3. Update tournament row ─────────────────────────────────────────────
  // weekly_captains: always overwrite when provided (supports deletions)
  $wc = isset($body['weeklyCaptains'])
    ? json_encode($body['weeklyCaptains'], JSON_UNESCAPED_SLASHES)
    : null;

  $pdo->prepare(
    'UPDATE tournaments
     SET name=?, series_id=?, status=?, start_date=?,
         weekly_captains = IF(? IS NOT NULL, ?, weekly_captains)
     WHERE id=?'
  )->execute([
    $body['name'],
    $body['seriesId']  ?? null,
    $body['status']    ?? 'active',
    $body['startDate'] ?? date('Y-m-d'),
    $wc, $wc,
    $tId
  ]);

  // ── 4. Delete old teams + players ────────────────────────────────────────
  $pdo->prepare(
    'DELETE p FROM players p JOIN teams t ON t.id=p.team_id WHERE t.tournament_id=?'
  )->execute([$tId]);
  $pdo->prepare('DELETE FROM teams WHERE tournament_id=?')->execute([$tId]);

  // ── 5. Re-insert teams + players, build new ID maps ──────────────────────
  $newTeamByName   = []; // team_name   → new_db_id
  $newPlayerByName = []; // player_name → new_db_id

  foreach(($body['teams'] ?? []) as $team){
    $pdo->prepare(
      'INSERT INTO teams (tournament_id, name, owner, players_count) VALUES (?,?,?,?)'
    )->execute([
      $tId,
      $team['name'],
      $team['owner'] ?? $team['name'],
      count($team['players'] ?? [])
    ]);
    $newTeamId = (int)$pdo->lastInsertId();
    $newTeamByName[$team['name']] = $newTeamId;

    foreach(($team['players'] ?? []) as $p){
      $key = preg_replace('/[^a-z]/','',strtolower($p['name']));
      $old = $existingPlayers[$key] ?? null;

      // Always prefer DB-stored match_points (source of truth)
      $mp = $old['match_points'] ?? (
        !empty($p['matchPoints'])
          ? json_encode($p['matchPoints'], JSON_UNESCAPED_SLASHES)
          : null
      );

      $pdo->prepare(
        'INSERT INTO players
           (team_id, name, original_name, price,
            total_points, batting_points, bowling_points, fielding_points,
            match_points, is_injured, cricket_team, replaced_for)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      )->execute([
        $newTeamId,
        $p['name'],
        $p['originalName']   ?? $p['name'],
        $p['price']          ?? 0,
        $old['total_points']    ?? ($p['totalPoints']    ?? 0),
        $old['batting_points']  ?? ($p['battingPoints']  ?? 0),
        $old['bowling_points']  ?? ($p['bowlingPoints']  ?? 0),
        $old['fielding_points'] ?? ($p['fieldingPoints'] ?? 0),
        $mp,
        isset($p['isInjured']) ? ($p['isInjured'] ? 1 : 0) : 0,
        $p['cricketTeam']    ?? null,
        $p['replacedFor']    ?? null
      ]);
      $newPlayerId = (int)$pdo->lastInsertId();
      $newPlayerByName[$p['name']] = $newPlayerId;
    }
  }

  // ── 6. Remap weeklyCaptains: old IDs → new IDs → save updated JSON ───────
  // Problem: teams/players are re-inserted with new auto-increment IDs every
  // time. weeklyCaptains stores old IDs. We remap them here so the JSON
  // always contains valid current IDs.
  if(isset($body['weeklyCaptains']) && is_array($body['weeklyCaptains'])){

    $remapped = [];

    foreach($body['weeklyCaptains'] as $weekKey => $teamSels){
      if(!is_array($teamSels)) continue;
      $remapped[$weekKey] = [];

      foreach($teamSels as $oldTeamId => $sel){
        if(!is_array($sel)) continue;

        // Resolve team: old DB id → team name → new DB id
        $teamName  = $oldTeamMap[(string)$oldTeamId] ?? null;
        $newTeamId = $teamName ? ($newTeamByName[$teamName] ?? null) : null;
        if(!$newTeamId) continue; // team no longer exists

        // Resolve captain player: old id → player name → new id
        $capName  = $oldPlayerMap[$sel['captain'] ?? ''] ?? null;
        $newCapId = $capName ? ($newPlayerByName[$capName] ?? null) : null;

        // Resolve VC player
        $vcName  = $oldPlayerMap[$sel['vc'] ?? ''] ?? null;
        $newVcId = $vcName ? ($newPlayerByName[$vcName] ?? null) : null;

        if(!$newCapId || !$newVcId) continue; // players no longer exist

        $remapped[$weekKey][(string)$newTeamId] = [
          'captain' => (string)$newCapId,
          'vc'      => (string)$newVcId,
        ];
      }

      if(empty($remapped[$weekKey])) unset($remapped[$weekKey]);
    }

    // Save remapped JSON back to tournaments table
    $pdo->prepare('UPDATE tournaments SET weekly_captains=? WHERE id=?')
        ->execute([json_encode($remapped, JSON_UNESCAPED_SLASHES), $tId]);

    // Also write to weekly_captains table (structured rows for queries)
    $pdo->prepare('DELETE FROM weekly_captains WHERE tournament_id=?')->execute([$tId]);
    $stmtWC = $pdo->prepare(
      'INSERT INTO weekly_captains
         (tournament_id, team_id, week_key, captain_id, vc_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)'
    );
    foreach($remapped as $weekKey => $teamSels){
      foreach($teamSels as $teamId => $sel){
        $stmtWC->execute([
          $tId,
          (int)$teamId,
          $weekKey,
          (int)$sel['captain'],
          (int)$sel['vc'],
          time(), time()
        ]);
      }
    }
  }

  // ── 7. Matches: rebuild preserving scorecard_raw and is_scored ────────────
  if(isset($body['matches']) && is_array($body['matches'])){
    $pdo->prepare('DELETE FROM matches WHERE tournament_id=?')->execute([$tId]);
    $stmtM = $pdo->prepare(
      'INSERT INTO matches
         (tournament_id, external_id, name, match_number, date, venue,
          status, result, team_info, is_scored, scorecard_raw, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    foreach($body['matches'] as $m){
      $extId  = $m['id'] ?? null;
      $cached = $existingMatches[$extId] ?? [];
      $stmtM->execute([
        $tId,
        $extId,
        $m['name']   ?? null,
        $m['matchNumber'] ?? null,
        $m['date']   ?? null,
        $m['venue']  ?? null,
        $m['status'] ?? null,
        $m['result'] ?? null,
        !empty($m['teamInfo']) ? json_encode($m['teamInfo'],JSON_UNESCAPED_SLASHES) : null,
        isset($m['isScored']) ? ($m['isScored']?1:0) : ($cached['is_scored'] ?? 0),
        $cached['scorecard_raw'] ?? null, // always restore from cache, never from frontend
        time()
      ]);
    }
  }

  $pdo->commit();
  echo json_encode(['status'=>'success']);

} catch(Exception $e){
  $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['status'=>'failure','reason'=>$e->getMessage()]);
}