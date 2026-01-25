<?php
// Site Mode API for FastHosts (PHP)
// - Public: GET returns site mode JSON
// - Protected: PUT updates site mode (Basic auth)
//
// Used by the admin panel to switch the public site between:
// - live
// - maintenance
//
// The public site (e.g. index.html) can check this endpoint and redirect to
// pages/maintenance.html when mode === "maintenance".

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$STORE_FILE = __DIR__ . DIRECTORY_SEPARATOR . 'site_mode.store.json';

// Prefer dedicated env vars, but fall back to the schedule creds so you can
// reuse the same configuration.
$ADMIN_USER = getenv('SITE_MODE_ADMIN_USERNAME') ?: (getenv('SCHEDULE_ADMIN_USERNAME') ?: '');
$ADMIN_PASS = getenv('SITE_MODE_ADMIN_PASSWORD') ?: (getenv('SCHEDULE_ADMIN_PASSWORD') ?: '');

$DEFAULT_MODE = 'live';

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

function readStoredMode(string $storeFile, string $defaultMode): array {
  if (!file_exists($storeFile)) {
    return [
      'mode' => $defaultMode,
      'updatedAtUtc' => null,
    ];
  }

  $raw = file_get_contents($storeFile);
  if ($raw === false) {
    return [
      'mode' => $defaultMode,
      'updatedAtUtc' => null,
    ];
  }

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) {
    return [
      'mode' => $defaultMode,
      'updatedAtUtc' => null,
    ];
  }

  $mode = isset($parsed['mode']) && is_string($parsed['mode']) ? strtolower(trim($parsed['mode'])) : $defaultMode;
  if ($mode !== 'maintenance' && $mode !== 'live') $mode = $defaultMode;

  $updated = null;
  if (array_key_exists('updatedAtUtc', $parsed) && is_string($parsed['updatedAtUtc'])) {
    $updated = trim($parsed['updatedAtUtc']);
  }

  return [
    'mode' => $mode,
    'updatedAtUtc' => $updated ?: null,
  ];
}

function getBasicAuthCreds(): array {
  $user = $_SERVER['PHP_AUTH_USER'] ?? '';
  $pass = $_SERVER['PHP_AUTH_PW'] ?? '';

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
    header('WWW-Authenticate: Basic realm="Site Mode Admin"');
    jsonResponse(['error' => 'Unauthorized'], 401);
  }
}

sendCors($ALLOWED_ORIGINS);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($method === 'GET') {
  $stored = readStoredMode($STORE_FILE, $DEFAULT_MODE);
  jsonResponse($stored, 200);
}

if ($method === 'PUT') {
  requireAuth($ADMIN_USER, $ADMIN_PASS);

  $raw = file_get_contents('php://input');
  if ($raw === false) jsonResponse(['error' => 'Could not read request body.'], 400);

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) jsonResponse(['error' => 'Invalid JSON.'], 400);

  $mode = isset($parsed['mode']) && is_string($parsed['mode']) ? strtolower(trim($parsed['mode'])) : '';
  if ($mode !== 'maintenance' && $mode !== 'live') {
    jsonResponse(['error' => 'mode must be "live" or "maintenance".'], 400);
  }

  $payload = [
    'mode' => $mode,
    'updatedAtUtc' => gmdate('c'),
  ];

  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($json === false) jsonResponse(['error' => 'Could not encode JSON.'], 500);
  if (strlen($json) > 5000) jsonResponse(['error' => 'Payload too large.'], 413);

  $ok = file_put_contents($STORE_FILE, $json, LOCK_EX);
  if ($ok === false) jsonResponse(['error' => 'Could not save site mode.'], 500);

  jsonResponse(['ok' => true, 'mode' => $mode, 'updatedAtUtc' => $payload['updatedAtUtc']], 200);
}

jsonResponse(['error' => 'Method not allowed'], 405);
