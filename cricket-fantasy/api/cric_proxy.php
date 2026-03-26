<?php

header('Content-Type: application/json');

// 🔥 GET API KEY FROM .ENV FILE
$envFile = __DIR__ . '/.env';
$env = file_exists($envFile) ? parse_ini_file($envFile) : [];

// Params
$type   = $_GET['type']   ?? '';
$id     = $_GET['id']     ?? '';
$search = $_GET['search'] ?? '';

// Determine which key to use based on the fetch type
$apiKeyMap = [
    'series'    => $env['CRICAPI_SERIES_KEY'] ?? '',
    'scorecard' => $env['CRICAPI_SCORECARD_KEY'] ?? '',
    'players'   => $env['CRICAPI_PLAYERS_KEY'] ?? ''
];
$API_KEY = $apiKeyMap[$type] ?? '';

if (!$API_KEY) {
    echo json_encode(["status"=>"error","reason"=>"API Key mapping missing for type: $type"]);
    exit;
}

// Validate
if (!$type) {
    echo json_encode(["status"=>"error","reason"=>"Missing type"]);
    exit;
}

// Build URL
if ($type === 'series') {
    $url = "https://api.cricapi.com/v1/series_info?apikey=$API_KEY&id=$id";
}
else if ($type === 'scorecard') {
    $url = "https://api.cricapi.com/v1/match_scorecard?apikey=$API_KEY&id=$id";
}
else if ($type === 'players') {
    $url = "https://api.cricapi.com/v1/players?apikey=$API_KEY&search=" . urlencode($search);
}
else {
    echo json_encode(["status"=>"error","reason"=>"Invalid type"]);
    exit;
}

// 🔥 Fetch (better with error handling)
$opts = [
    "http" => [
        "method"  => "GET",
        "timeout" => 10
    ]
];

$context = stream_context_create($opts);
$response = @file_get_contents($url, false, $context);

if (!$response) {
    echo json_encode([
        "status"=>"error",
        "reason"=>"API request failed",
        "url"=>$url // helpful debug
    ]);
    exit;
}

// Return response
echo $response;