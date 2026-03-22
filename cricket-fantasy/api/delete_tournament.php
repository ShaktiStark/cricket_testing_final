<?php
require 'db.php';

$body = json_decode(file_get_contents('php://input'), true);

if(!$body || !isset($body['id'])){
  http_response_code(400);
  echo json_encode(['status'=>'failure','reason'=>'Missing id']);
  exit;
}

try{
  $stmt = $pdo->prepare('DELETE FROM tournaments WHERE id = :id');
  $stmt->bindValue(':id', intval($body['id']), PDO::PARAM_INT);
  $stmt->execute();

  if($stmt->rowCount() === 0){
    echo json_encode(['status'=>'failure','reason'=>'Tournament not found']);
    exit;
  }

  echo json_encode(['status'=>'success']);

} catch(Exception $e){
  http_response_code(500);
  echo json_encode(['status'=>'failure','reason'=>$e->getMessage()]);
}