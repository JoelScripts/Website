<?php
// Schedule API for FastHosts (PHP)
// - Public: GET returns schedule JSON
// - Protected: PUT updates schedule JSON (Basic auth)

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$STORE_FILE = __DIR__ . DIRECTORY_SEPARATOR . 'schedule.store.json';

// Prefer environment variables, fall back to hardcoded values.
$ADMIN_USER = getenv('SCHEDULE_ADMIN_USERNAME') ?: '';
$ADMIN_PASS = getenv('SCHEDULE_ADMIN_PASSWORD') ?: '';

$DEFAULT_SCHEDULE = [
  [
    'dateKey' => '1-19',
    'dayName' => 'MON',
    'dateText' => 'Jan 19',
    'status' => 'none',
    'gameLogo' => '-',
    'timeText' => 'No Stream Planned',
    'zuluTime' => null,
    'streamTitle' => '-',
    'vodUrl' => null,
  ],
  [
    'dateKey' => '1-20',
    'dayName' => 'TUE',
    'dateText' => 'Jan 20',
    'status' => 'completed',
    'gameLogo' => '✈️',
    'timeText' => '18:00 Zulu',
    'zuluTime' => '18:00 Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => 'https://www.twitch.tv/Flyingwithjoel/videos',
  ],
  [
    'dateKey' => '1-21',
    'dayName' => 'WED',
    'dateText' => 'Jan 21',
    'status' => 'completed',
    'gameLogo' => '✈️',
    'timeText' => '18:00 Zulu',
    'zuluTime' => '18:00 Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => 'https://www.twitch.tv/Flyingwithjoel/videos',
  ],
  [
    'dateKey' => '1-22',
    'dayName' => 'THU',
    'dateText' => 'Jan 22',
    'status' => 'cancelled',
    'gameLogo' => '✈️',
    'timeText' => '15:30 Zulu',
    'zuluTime' => '15:30 Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => null,
  ],
  [
    'dateKey' => '1-23',
    'dayName' => 'FRI',
    'dateText' => 'Jan 23',
    'status' => 'completed',
    'gameLogo' => '✈️',
    'timeText' => '18:00 Zulu',
    'zuluTime' => '18:00 Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => 'https://www.twitch.tv/videos/2677982122',
  ],
  [
    'dateKey' => '1-24',
    'dayName' => 'SAT',
    'dateText' => 'Jan 24',
    'status' => 'scheduled',
    'gameLogo' => '✈️',
    'timeText' => '11:00 AM Zulu',
    'zuluTime' => '11:00 AM Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => null,
  ],
  [
    'dateKey' => '1-25',
    'dayName' => 'SUN',
    'dateText' => 'Jan 25',
    'status' => 'scheduled',
    'gameLogo' => '✈️',
    'timeText' => '11:00 AM Zulu',
    'zuluTime' => '11:00 AM Zulu',
    'streamTitle' => 'Microsoft Flight Simulator',
    'vodUrl' => null,
  ],
];

function sendCors(array $allowedOrigins): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    header('Access-Control-Allow-Headers: content-type, authorization');
    header('Access-Control-Max-Age: 86400');
  }
}

function jsonResponse($data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}

function readStoredSchedule(string $storeFile, array $defaultSchedule): array {
  if (!file_exists($storeFile)) return $defaultSchedule;
  $raw = file_get_contents($storeFile);
  if ($raw === false) return $defaultSchedule;
  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) return $defaultSchedule;
  return $parsed;
}

function getBasicAuthCreds(): array {
  // PHP may populate these differently depending on server config.
  $user = $_SERVER['PHP_AUTH_USER'] ?? '';
  $pass = $_SERVER['PHP_AUTH_PW'] ?? '';

  // If not set, try parsing Authorization header.
  if (!$user && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $h = $_SERVER['HTTP_AUTHORIZATION'];
    if (stripos($h, 'Basic ') === 0) {
      $decoded = base64_decode(substr($h, 6));
      if ($decoded !== false) {
        $parts = explode(':', $decoded, 2);
        if (count($parts) === 2) {
          $user = $parts[0];
          $pass = $parts[1];
        }
      }
    }
  }

  return [$user, $pass];
}

function constantTimeEqual(string $a, string $b): bool {
  if (strlen($a) !== strlen($b)) return false;
  $diff = 0;
  for ($i = 0; $i < strlen($a); $i += 1) {
    $diff |= ord($a[$i]) ^ ord($b[$i]);
  }
  return $diff === 0;
}

function requireAuth(string $adminUser, string $adminPass): void {
  if ($adminUser === '' || $adminPass === '') {
    jsonResponse(['error' => 'Server not configured.'], 500);
  }

  [$user, $pass] = getBasicAuthCreds();

  if (!constantTimeEqual((string)$user, (string)$adminUser) || !constantTimeEqual((string)$pass, (string)$adminPass)) {
    header('WWW-Authenticate: Basic realm="Schedule Admin"');
    jsonResponse(['error' => 'Unauthorized'], 401);
  }
}

function validateSchedule($schedule): ?string {
  if (!is_array($schedule)) return 'Schedule must be an array.';
  if (count($schedule) < 1 || count($schedule) > 14) return 'Schedule array must be 1–14 items.';

  $allowedStatus = ['none' => true, 'scheduled' => true, 'completed' => true, 'cancelled' => true];

  foreach ($schedule as $item) {
    if (!is_array($item)) return 'Each schedule entry must be an object.';

    $dateKey = isset($item['dateKey']) && is_string($item['dateKey']) ? trim($item['dateKey']) : '';
    $dayName = isset($item['dayName']) && is_string($item['dayName']) ? trim($item['dayName']) : '';
    $dateText = isset($item['dateText']) && is_string($item['dateText']) ? trim($item['dateText']) : '';
    $status = isset($item['status']) && is_string($item['status']) ? strtolower(trim($item['status'])) : '';

    if ($dateKey === '') return 'Each entry must include dateKey.';
    if ($dayName === '') return 'Each entry must include dayName.';
    if ($dateText === '') return 'Each entry must include dateText.';
    if (!isset($allowedStatus[$status])) return 'Invalid status: ' . $status;

    if (array_key_exists('zuluTime', $item) && $item['zuluTime'] !== null) {
      if (!is_string($item['zuluTime'])) return 'zuluTime must be a string or null.';
      if (stripos($item['zuluTime'], 'zulu') === false) return 'zuluTime must include "Zulu".';
    }

    if (array_key_exists('vodUrl', $item) && $item['vodUrl'] !== null) {
      if (!is_string($item['vodUrl'])) return 'vodUrl must be a string or null.';
      if (stripos($item['vodUrl'], 'https://') !== 0) return 'vodUrl must start with https://';
    }
  }

  return null;
}

sendCors($ALLOWED_ORIGINS);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($method === 'GET') {
  $schedule = readStoredSchedule($STORE_FILE, $DEFAULT_SCHEDULE);
  jsonResponse($schedule, 200);
}

if ($method === 'PUT') {
  requireAuth($ADMIN_USER, $ADMIN_PASS);

  $raw = file_get_contents('php://input');
  if ($raw === false) jsonResponse(['error' => 'Could not read request body.'], 400);

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) jsonResponse(['error' => 'Invalid JSON.'], 400);

  $err = validateSchedule($parsed);
  if ($err !== null) jsonResponse(['error' => $err], 400);

  $json = json_encode($parsed, JSON_UNESCAPED_SLASHES);
  if ($json === false) jsonResponse(['error' => 'Could not encode schedule.'], 500);
  if (strlen($json) > 50000) jsonResponse(['error' => 'Schedule too large.'], 413);

  $ok = file_put_contents($STORE_FILE, $json, LOCK_EX);
  if ($ok === false) jsonResponse(['error' => 'Could not save schedule.'], 500);

  jsonResponse(['ok' => true], 200);
}

jsonResponse(['error' => 'Method not allowed'], 405);
