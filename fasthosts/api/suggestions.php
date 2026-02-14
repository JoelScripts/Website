<?php
// Suggestions API for FastHosts (PHP)
// - Public: POST accepts flight suggestion JSON and forwards to Discord webhook

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$DISCORD_WEBHOOK_URL = getenv('SUGGESTIONS_DISCORD_WEBHOOK_URL') ?: (getenv('DISCORD_WEBHOOK_URL') ?: '');

function sendCors(array $allowedOrigins): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: content-type');
    header('Access-Control-Max-Age: 86400');
  }
}

function jsonResponse($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}

function clampString($value, int $maxLen): string {
  if (!is_string($value)) return '';
  $trimmed = trim($value);
  if (strlen($trimmed) > $maxLen) {
    return substr($trimmed, 0, $maxLen);
  }
  return $trimmed;
}

function validateFlightRadarLink(string $link): ?string {
  if ($link === '' || strtolower($link) === 'not provided') return null;
  if (stripos($link, 'https://') !== 0) return 'FlightRadar24 link must start with https://';
  $parts = parse_url($link);
  $host = isset($parts['host']) && is_string($parts['host']) ? strtolower($parts['host']) : '';
  if ($host === '' || strpos($host, 'flightradar24.com') === false) {
    return 'Please use a FlightRadar24 link (flightradar24.com).';
  }
  return null;
}

function postJson(string $url, array $payload): bool {
  $ch = curl_init($url);
  if ($ch === false) return false;

  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
  curl_setopt($ch, CURLOPT_TIMEOUT, 6);
  curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);

  return $code >= 200 && $code < 300;
}

function buildDiscordMessage(array $s): array {
  $name = $s['name'] !== '' ? $s['name'] : 'Unknown';
  $flightNumber = $s['flightNumber'] !== '' ? $s['flightNumber'] : 'Unknown';
  $departure = $s['departure'] !== '' ? $s['departure'] : 'Unknown';
  $arrival = $s['arrival'] !== '' ? $s['arrival'] : 'Unknown';

  return [
    'allowed_mentions' => ['parse' => []],
    'content' => "✈️ **New Flight Suggestion from {$name}**",
    'embeds' => [[
      'title' => '✈️ Flight Suggestion Received',
      'description' => "{$flightNumber} - {$departure} to {$arrival}",
      'color' => 0xff8c42,
      'fields' => [
        ['name' => '✈️ Flight Number', 'value' => $flightNumber, 'inline' => true],
        ['name' => '📡 Callsign', 'value' => $s['callsign'], 'inline' => true],
        ['name' => '🛩️ Aircraft', 'value' => $s['aircraft'], 'inline' => true],
        ['name' => '🛫 Departure', 'value' => $departure, 'inline' => true],
        ['name' => '🛬 Arrival', 'value' => $arrival, 'inline' => true],
        ['name' => '📍 Route', 'value' => $s['route'], 'inline' => false],
        ['name' => '🔗 FlightRadar24 Link', 'value' => $s['flightRadarLink'] !== '' ? $s['flightRadarLink'] : 'Not provided', 'inline' => false],
        ['name' => '⏱️ Flight Time', 'value' => $s['flightTime'], 'inline' => true],
        ['name' => '📊 Flight Length', 'value' => $s['flightLength'], 'inline' => true],
        ['name' => '📅 Date of Flight', 'value' => $s['flightDate'] !== '' ? $s['flightDate'] : 'Not specified', 'inline' => true],
        ['name' => '👤 Suggested By', 'value' => $name, 'inline' => true],
        ['name' => '🎥 Twitch Handle', 'value' => $s['twitchHandle'] !== '' ? $s['twitchHandle'] : 'Not provided', 'inline' => true],
        ['name' => '⏰ Submitted', 'value' => gmdate('c') . ' UTC', 'inline' => false],
      ],
      'footer' => ['text' => 'From: flyingwithjoel.co.uk'],
    ]],
  ];
}

sendCors($ALLOWED_ORIGINS);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($method !== 'POST') {
  jsonResponse(['error' => 'Method not allowed'], 405);
}

if ($DISCORD_WEBHOOK_URL === '') {
  jsonResponse(['error' => 'Server not configured.'], 500);
}

$raw = file_get_contents('php://input');
if ($raw === false) {
  jsonResponse(['error' => 'Could not read request body.'], 400);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
  jsonResponse(['error' => 'Invalid JSON.'], 400);
}

$honeypot = clampString($payload['website'] ?? '', 80);
if ($honeypot !== '') {
  jsonResponse(['error' => 'Submission blocked.'], 400);
}

$suggestion = [
  'flightDate' => clampString($payload['flightDate'] ?? '', 40),
  'flightNumber' => clampString($payload['flightNumber'] ?? '', 30),
  'callsign' => clampString($payload['callsign'] ?? '', 30),
  'aircraft' => clampString($payload['aircraft'] ?? '', 40),
  'departure' => clampString($payload['departure'] ?? '', 60),
  'arrival' => clampString($payload['arrival'] ?? '', 60),
  'route' => clampString($payload['route'] ?? '', 200),
  'flightRadarLink' => clampString($payload['flightRadarLink'] ?? '', 300),
  'flightTime' => clampString($payload['flightTime'] ?? '', 20),
  'flightLength' => clampString($payload['flightLength'] ?? '', 40),
  'name' => clampString($payload['name'] ?? '', 60),
  'twitchHandle' => clampString($payload['twitchHandle'] ?? '', 40),
];

$required = ['flightNumber', 'callsign', 'aircraft', 'departure', 'arrival', 'route', 'flightTime', 'flightLength', 'name'];
foreach ($required as $field) {
  if ($suggestion[$field] === '') {
    jsonResponse(['error' => 'Missing required field: ' . $field], 400);
  }
}

$frErr = validateFlightRadarLink($suggestion['flightRadarLink']);
if ($frErr !== null) {
  jsonResponse(['error' => $frErr], 400);
}

$discord = buildDiscordMessage($suggestion);
$ok = postJson($DISCORD_WEBHOOK_URL, $discord);
if (!$ok) {
  jsonResponse(['error' => 'Upstream delivery failed.'], 502);
}

jsonResponse(['ok' => true], 200);
