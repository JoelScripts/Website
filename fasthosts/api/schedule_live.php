<?php
// Twitch live status endpoint for FastHosts (PHP)
// Public: GET returns { ok: true, live: boolean }

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

function sendCors(array $allowedOrigins): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: content-type');
    header('Access-Control-Max-Age: 86400');
  }
}

function jsonResponse($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}

sendCors($ALLOWED_ORIGINS);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
  jsonResponse(['ok' => false, 'error' => 'Method Not Allowed'], 405);
}

$clientId = getenv('TWITCH_CLIENT_ID') ?: '';
$clientSecret = getenv('TWITCH_CLIENT_SECRET') ?: '';
$login = strtolower(trim((string) (getenv('TWITCH_CHANNEL_LOGIN') ?: 'flyingwithjoel')));

if ($clientId === '' || $clientSecret === '' || $login === '') {
  // Keep status=200 so browsers can read the JSON; UI treats ok:false as "unavailable".
  jsonResponse(['ok' => false, 'error' => 'Missing TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET (or channel login).'], 200);
}

$dir = __DIR__;
$tokenCacheFile = $dir . DIRECTORY_SEPARATOR . 'twitch_token.cache.json';
$liveCacheFile = $dir . DIRECTORY_SEPARATOR . 'twitch_live.cache.json';

function readJsonFile(string $path): ?array {
  if (!file_exists($path)) return null;
  $raw = @file_get_contents($path);
  if ($raw === false) return null;
  $parsed = json_decode($raw, true);
  return is_array($parsed) ? $parsed : null;
}

function writeJsonFile(string $path, array $data): void {
  @file_put_contents($path, json_encode($data, JSON_UNESCAPED_SLASHES));
}

$now = time();

// Small live-cache to reduce upstream calls (schedule page polls once/minute).
$liveCache = readJsonFile($liveCacheFile);
if ($liveCache && isset($liveCache['expiresAt'], $liveCache['live'])) {
  $expiresAt = (int) $liveCache['expiresAt'];
  $liveVal = $liveCache['live'];
  if ($expiresAt > $now && is_bool($liveVal)) {
    jsonResponse(['ok' => true, 'live' => $liveVal], 200);
  }
}

function getAccessToken(string $clientId, string $clientSecret, string $tokenCacheFile, int $now): ?string {
  $cached = readJsonFile($tokenCacheFile);
  if ($cached && isset($cached['accessToken'], $cached['expiresAt'])) {
    $expiresAt = (int) $cached['expiresAt'];
    $token = is_string($cached['accessToken']) ? $cached['accessToken'] : '';
    if ($token !== '' && $expiresAt > ($now + 60)) {
      return $token;
    }
  }

  $url = 'https://id.twitch.tv/oauth2/token'
    . '?client_id=' . rawurlencode($clientId)
    . '&client_secret=' . rawurlencode($clientSecret)
    . '&grant_type=client_credentials';

  $ctx = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
      'timeout' => 8,
    ],
  ]);

  $raw = @file_get_contents($url, false, $ctx);
  if ($raw === false) return null;
  $json = json_decode($raw, true);
  if (!is_array($json)) return null;

  $token = isset($json['access_token']) && is_string($json['access_token']) ? $json['access_token'] : null;
  $expiresIn = isset($json['expires_in']) && is_int($json['expires_in']) ? $json['expires_in'] : null;
  if (!$token || !$expiresIn) return null;

  $expiresAt = $now + max(60, $expiresIn - 60);
  writeJsonFile($tokenCacheFile, ['accessToken' => $token, 'expiresAt' => $expiresAt]);
  return $token;
}

$token = getAccessToken($clientId, $clientSecret, $tokenCacheFile, $now);
if (!$token) {
  jsonResponse(['ok' => false, 'error' => 'Could not obtain Twitch access token.'], 200);
}

$streamsUrl = 'https://api.twitch.tv/helix/streams?user_login=' . rawurlencode($login);
$ctx = stream_context_create([
  'http' => [
    'method' => 'GET',
    'header' =>
      'Client-ID: ' . $clientId . "\r\n"
      . 'Authorization: Bearer ' . $token . "\r\n",
    'timeout' => 8,
  ],
]);

$raw = @file_get_contents($streamsUrl, false, $ctx);
if ($raw === false) {
  jsonResponse(['ok' => false, 'error' => 'Twitch status request failed.'], 200);
}

$json = json_decode($raw, true);
$data = (is_array($json) && isset($json['data']) && is_array($json['data'])) ? $json['data'] : [];
$live = count($data) > 0;

// Cache for ~20 seconds.
writeJsonFile($liveCacheFile, ['live' => $live, 'expiresAt' => ($now + 20)]);

jsonResponse(['ok' => true, 'live' => $live], 200);
