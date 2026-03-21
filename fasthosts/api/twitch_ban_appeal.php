<?php
declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$DISCORD_WEBHOOK_URL =
  getenv('TWITCH_BAN_APPEAL_DISCORD_WEBHOOK_URL')
  ?: (getenv('BAN_APPEALS_DISCORD_WEBHOOK_URL')
  ?: (getenv('DISCORD_WEBHOOK_URL') ?: ''));

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
  if (!is_string($value)) {
    return '';
  }
  $trimmed = trim($value);
  if (strlen($trimmed) > $maxLen) {
    return substr($trimmed, 0, $maxLen);
  }
  return $trimmed;
}

function isValidEmail(string $email): bool {
  return $email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
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
  curl_setopt($ch, CURLOPT_TIMEOUT, 8);
  curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);

  return $code >= 200 && $code < 300;
}

function buildDiscordMessage(array $appeal): array {
  $contact = $appeal['contactEmail'] !== '' ? $appeal['contactEmail'] : 'Not provided';
  $discord = $appeal['discordUsername'] !== '' ? $appeal['discordUsername'] : 'Not provided';

  return [
    'allowed_mentions' => ['parse' => []],
    'content' => "📨 **New Twitch Ban Appeal from {$appeal['twitchUsername']}**",
    'embeds' => [[
      'title' => 'Twitch Ban Appeal',
      'color' => 0x9146ff,
      'fields' => [
        ['name' => 'Twitch Username', 'value' => $appeal['twitchUsername'], 'inline' => true],
        ['name' => 'Discord Username', 'value' => $discord, 'inline' => true],
        ['name' => 'Contact Email', 'value' => $contact, 'inline' => true],
        ['name' => 'Approximate Ban Date', 'value' => $appeal['banDate'], 'inline' => true],
        ['name' => 'Ban Context', 'value' => $appeal['banReason'], 'inline' => false],
        ['name' => 'Why It Should Be Reviewed', 'value' => $appeal['appealReason'], 'inline' => false],
        ['name' => 'What Will Change Going Forward', 'value' => $appeal['futureCommitment'], 'inline' => false],
        ['name' => 'Honesty Confirmed', 'value' => $appeal['honestyConfirmed'] ? 'Yes' : 'No', 'inline' => true],
        ['name' => 'Submitted', 'value' => gmdate('c') . ' UTC', 'inline' => true],
      ],
      'footer' => ['text' => 'From: flyingwithjoel.co.uk rules page'],
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

$appeal = [
  'website' => clampString($payload['website'] ?? '', 50),
  'twitchUsername' => clampString($payload['twitchUsername'] ?? '', 40),
  'discordUsername' => clampString($payload['discordUsername'] ?? '', 60),
  'banDate' => clampString($payload['banDate'] ?? '', 40),
  'contactEmail' => clampString($payload['contactEmail'] ?? '', 120),
  'banReason' => clampString($payload['banReason'] ?? '', 1000),
  'appealReason' => clampString($payload['appealReason'] ?? '', 1200),
  'futureCommitment' => clampString($payload['futureCommitment'] ?? '', 1000),
  'honestyConfirmed' => (bool)($payload['honestyConfirmed'] ?? false),
];

if ($appeal['website'] !== '') {
  jsonResponse(['error' => 'Submission blocked.'], 400);
}

$required = ['twitchUsername', 'banDate', 'banReason', 'appealReason', 'futureCommitment'];
foreach ($required as $field) {
  if ($appeal[$field] === '') {
    jsonResponse(['error' => 'Missing required field: ' . $field], 400);
  }
}

if (!$appeal['honestyConfirmed']) {
  jsonResponse(['error' => 'You must confirm the appeal is honest.'], 400);
}

if (!isValidEmail($appeal['contactEmail'])) {
  jsonResponse(['error' => 'Please enter a valid email address.'], 400);
}

$discordPayload = buildDiscordMessage($appeal);
$ok = postJson($DISCORD_WEBHOOK_URL, $discordPayload);
if (!$ok) {
  jsonResponse(['error' => 'Upstream delivery failed.'], 502);
}

jsonResponse(['ok' => true], 200);
