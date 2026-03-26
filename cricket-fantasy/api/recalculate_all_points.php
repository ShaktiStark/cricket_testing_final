<?php
// ── recalculate_all_points.php ──────────────────────────────────────────────
// Resets all player points and rebuilds them natively from the DB cache
// (scorecard_raw) to fix the Sharma/Singh last-name collision corruption.
// ────────────────────────────────────────────────────────────────────────────
require 'db.php';

try {
  $pdo->beginTransaction();

  // 1. Reset all player points
  $pdo->exec("UPDATE players SET total_points=0, batting_points=0, bowling_points=0, fielding_points=0, match_points='{}'");

  // 2. Fetch all valid scorecards natively
  $stmt = $pdo->query("SELECT * FROM matches WHERE scorecard_raw IS NOT NULL AND scorecard_raw != ''");
  $matches = $stmt->fetchAll();

  // Load all players
  $pStmt = $pdo->query("SELECT * FROM players");
  $allPlayers = $pStmt->fetchAll();

  $updateP = $pdo->prepare("
    UPDATE players 
    SET total_points=?, batting_points=?, bowling_points=?, fielding_points=?, match_points=?, cricket_team=? 
    WHERE id=?
  ");

  $recalculated = 0;

  foreach($matches as $match) {
    $mid = $match['external_id'];
    $tid = $match['tournament_id'];
    $data = json_decode($match['scorecard_raw'], true);
    if(!$data) continue;

    $scorecard = normalizeScorecard($data);
    $lbwMap = buildLbwMap($scorecard);

    // Get weekly captains
    $matchDate = $match['date'] ?? date('Y-m-d');
    $ts = strtotime($matchDate);
    $day = date('w', $ts);
    $diff = ($day == 0) ? -6 : (1 - $day);
    $week = date('Y-m-d', strtotime("$diff days", $ts));

    $wcStmt = $pdo->prepare("SELECT team_id, captain_id, vc_id FROM weekly_captains WHERE tournament_id=? AND week_key=?");
    $wcStmt->execute([$tid, $week]);
    $wcMap = [];
    foreach($wcStmt->fetchAll() as $w){
      $wcMap[$w['team_id']] = ['captain' => (string)$w['captain_id'], 'vc' => (string)$w['vc_id']];
    }

    foreach($allPlayers as &$p) {
      if ($p['team_id'] == 0) continue; // safety

      $pname = normName($p['name']);
      $cricTeam = $p['cricket_team'] ?? '';

      $runs = 0; $balls = 0; $fours = 0; $sixes = 0; $sr = 0; $notout = false; $duck = false;
      $wkts = 0; $maidens = 0; $runsConceded = 0; $ovDec = 0.0; $eco = 0.0;
      $catches = 0; $runouts = 0; $stumpings = 0; $wides = 0; $noballs = 0;
      $bat = 0; $bowl = 0; $field = 0; $batNeg = 0; $bowlNeg = 0;

      $found = false;

      foreach($scorecard as $inn) {
        $innTeam = trim(preg_replace('/\s*(\d+\w*)?\s*(inning|innings).*/i', '', $inn['inning'] ?? ''));

        // Batting
        foreach(($inn['batting'] ?? []) as $b){
          $bn = normName($b['batsman']['name'] ?? $b['name'] ?? '');
          if($bn !== $pname) continue;
          if(!$cricTeam && $innTeam) $cricTeam = $innTeam;

          $runs   += (int)($b['r'] ?? 0);
          $balls  += (int)($b['b'] ?? 0);
          $fours  += (int)($b['4s'] ?? 0);
          $sixes  += (int)($b['6s'] ?? 0);
          $sr     = isset($b['sr']) ? (float)$b['sr'] : ($balls > 0 ? $runs / $balls * 100 : 0);
          $notout = str_contains(strtolower($b['dismissal-text'] ?? ''), 'not out');
          $duck   = $runs === 0 && $balls > 0 && !$notout;
          $found = true;
        }

        // Bowling
        foreach(($inn['bowling'] ?? []) as $bw){
          $bn = normName($bw['bowler']['name'] ?? $bw['name'] ?? '');
          if($bn !== $pname) continue;

          $wkts         += (int)($bw['w'] ?? 0);
          $maidens      += (int)($bw['m'] ?? 0);
          $runsConceded += (int)($bw['r'] ?? 0);
          $ovDec        += parseOvers((string)($bw['o'] ?? '0'));
          $eco          = isset($bw['eco']) ? (float)$bw['eco'] : ($ovDec > 0 ? $runsConceded / $ovDec : 0);
          $wides        += (int)($bw['wd'] ?? 0);
          $noballs      += (int)($bw['nb'] ?? 0);
          $found = true;
        }

        // Fielding
        foreach(($inn['catching'] ?? []) as $c){
          $cn = normName($c['catcher']['name'] ?? $c['name'] ?? '');
          if($cn !== $pname) continue;

          $catches   += (int)($c['catch'] ?? 0);
          $runouts   += (int)($c['runout'] ?? 0);
          $stumpings += (int)($c['stumped'] ?? 0);
          $found = true;
        }
      }

      if(!$found) continue;

      $batRes = calcBat($runs, $balls, $fours, $sixes, $sr, $duck, $notout);
      $bat = $batRes['pts']; $batNeg = $batRes['neg'];

      $lbwBowled = $lbwMap[$pname] ?? 0;
      $bowlRes = calcBowl($wkts, $maidens, $runsConceded, $ovDec, $eco, $wides, $noballs, $lbwBowled);
      $bowl = $bowlRes['pts']; $bowlNeg = $bowlRes['neg'];

      $field = ($catches * 10) + ($runouts * 10) + ($stumpings * 10);
      $basePts = $bat + $bowl + $field;

      $teamId = $p['team_id'];
      $multiplier = 1;
      if(isset($wcMap[$teamId])){
        $wc = $wcMap[$teamId];
        if((string)$p['id'] === $wc['captain']) $multiplier = 2;
        elseif((string)$p['id'] === $wc['vc']) $multiplier = 1.5;
      }

      $newPts = $basePts * $multiplier;

      $existMp = !empty($p['match_points']) ? json_decode($p['match_points'], true) : [];
      $existMp[$mid] = [
        'batting' => ['points' => $bat, 'runs' => $runs, 'balls' => $balls, 'strikeRate' => round($sr, 1), 'fours' => $fours, 'sixes' => $sixes],
        'bowling' => ['points' => $bowl, 'wickets' => $wkts, 'overs' => round($ovDec, 2), 'economy' => round($eco, 2), 'maidens' => $maidens, 'wides' => $wides, 'noballs' => $noballs],
        'fielding' => ['points' => $field, 'catches' => $catches, 'runouts' => $runouts, 'stumpings' => $stumpings],
        'bonus' => ['captain' => $multiplier === 2 ? $basePts : 0, 'vc' => $multiplier === 1.5 ? ($basePts * 0.5) : 0, 'milestone' => 0, 'mom' => 0, 'manual' => 0],
        'negative' => $batNeg + $bowlNeg
      ];

      $p['total_points'] += $newPts;
      $p['batting_points'] += $bat;
      $p['bowling_points'] += $bowl;
      $p['fielding_points'] += $field;
      $p['match_points'] = json_encode($existMp, JSON_UNESCAPED_SLASHES);
      $p['cricket_team'] = $cricTeam ?: ($p['cricket_team'] ?? '');

      $updateP->execute([
        $p['total_points'], $p['batting_points'], $p['bowling_points'],
        $p['fielding_points'], $p['match_points'], $p['cricket_team'], $p['id']
      ]);
    }
    $recalculated++;
  }

  // Set is_scored=1 globally just to be absolutely certain the system treats them as done
  $pdo->exec("UPDATE matches SET is_scored=1 WHERE scorecard_raw IS NOT NULL AND scorecard_raw != ''");

  $pdo->commit();
  echo json_encode(["status"=>"success", "recalculated_matches"=>$recalculated]);

} catch(Exception $e) {
  $pdo->rollBack();
  echo json_encode(["status"=>"failure", "reason"=>$e->getMessage()]);
}

// ── Helpers ──
function normalizeScorecard($apiData) {
  $src = $apiData['scorecard'] ?? $apiData['innings'] ?? [];
  $innings = [];
  foreach($src as $sc) {
    $innings[] = [
      'inning' => $sc['inning'] ?? $sc['team'] ?? '',
      'batting' => $sc['batting'] ?? [],
      'bowling' => $sc['bowling'] ?? [],
      'catching' => $sc['catching'] ?? []
    ];
  }
  return $innings;
}
function normName(string $s): string { return preg_replace('/[^a-z]/', '', strtolower($s)); }
function parseOvers(string $s): float { $p = explode('.', $s); return (int)$p[0] + ((int)($p[1] ?? 0)) / 6; }
function buildLbwMap(array $scorecard): array {
  $m = [];
  foreach($scorecard as $inn) foreach(($inn['batting']??[]) as $b) {
    if(preg_match('/b\s+([a-z\s]+)/', strtolower($b['dismissal-text']??''), $mat)) {
      $lbw = normName($mat[1]); $m[$lbw] = ($m[$lbw]??0)+1;
    }
  }
  return $m;
}
function calcBat(int $r, int $b, int $fs, int $ss, float $sr, bool $duck, bool $no): array {
  $J=$duck?-10:$r; $neg=$duck?-10:0; $K=0;
  foreach([25,50,75,100,125,150,175,200] as $t) if($r>=$t) $K+=25;
  $L=0; if($sr<50)$L=-60;elseif($sr<75)$L=-40;elseif($sr<100)$L=-20;elseif($sr<125)$L=-10;elseif($sr<=150)$L=0;elseif($sr<=175)$L=10;elseif($sr<=200)$L=20;elseif($sr<=250)$L=40;elseif($sr<=300)$L=60;elseif($sr<=350)$L=80;else$L=100;
  $M=($r>20||$b>=10)?$L:0; if($M<0)$neg+=$M;
  return ['pts'=>$J+$K+$M+$fs+$ss*2+($no?10:0), 'neg'=>$neg];
}
function calcBowl(int $w, int $m, int $r, float $ov, float $eco, int $wd, int $nb, int $lbw): array {
  $pts=$w*25; $neg=0;
  if($w>=8)$pts+=175;elseif($w===7)$pts+=150;elseif($w===6)$pts+=125;elseif($w===5)$pts+=100;elseif($w===4)$pts+=75;elseif($w===3)$pts+=50;
  $pts+=$m*40;
  if($ov>=2){
    if($eco<1)$pts+=120;elseif($eco<2)$pts+=80;elseif($eco<4)$pts+=40;elseif($eco<6)$pts+=20;elseif($eco<8)$pts+=10;elseif($eco<=10)$pts+=0;elseif($eco>16){$pts-=60;$neg-=60;}elseif($eco>14){$pts-=40;$neg-=40;}elseif($eco>12){$pts-=20;$neg-=20;}elseif($eco>10){$pts-=10;$neg-=10;}
  }
  $pts-=($wd+$nb)*2; $neg-=($wd+$nb)*2; $pts+=$lbw*10; return ['pts'=>$pts,'neg'=>$neg];
}
