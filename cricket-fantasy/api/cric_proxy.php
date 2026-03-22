<?php

header('Content-Type: application/json');

// 🔒 YOUR SECRET KEY (only here)
$API_KEY = "28147e70-c944-44b9-9aa1-b273d0daafd1";

// Get params from frontend
$type = $_GET['type'] ?? '';
$id   = $_GET['id'] ?? '';
$search = $_GET['search'] ?? '';

// Build URL based on request
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

// Fetch from CricAPI
$response = file_get_contents($url);

if(!$response){
    echo json_encode(["status"=>"error","reason"=>"API failed"]);
    exit;
}

// Return response
echo $response;