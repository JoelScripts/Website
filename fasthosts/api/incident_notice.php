<?php
// Incident Notice API for FastHosts (PHP)
// - Public: GET returns current incident notice JSON
// - Protected: PUT updates incident notice (Basic auth)
//
// Shape:
//   { enabled: bool, title: string|null, message: string|null, updatedAtUtc: string|null }
//
// This is used by the site (assets/js/main.js) to show a banner and by admin.html
// as a fallback when /api/incident-notice (Worker route) is not available.

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$STORE_FILE = __DIR__ . DIRECTORY_SEPARATOR . 'incident_notice.store.json';

// Prefer dedicated env vars, but fall back to the schedule creds.
$ADMIN_USER = getenv('INCIDENT_NOTICE_ADMIN_USERNAME') ?: (getenv('SCHEDULE_ADMIN_USERNAME') ?: '');
$ADMIN_PASS = getenv('INCIDENT_NOTICE_ADMIN_PASSWORD') ?: (getenv('SCHEDULE_ADMIN_PASSWORD') ?: '');

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
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
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
    header('WWW-Authenticate: Basic realm="Incident Notice Admin"');
    jsonResponse(['error' => 'Unauthorized'], 401);
  }
}

function readStoredNotice(string $storeFile): array {
  if (!file_exists($storeFile)) {
    return ['enabled' => false, 'title' => null, 'message' => null, 'updatedAtUtc' => null];
  }

  $raw = file_get_contents($storeFile);
  if ($raw === false) {
    return ['enabled' => false, 'title' => null, 'message' => null, 'updatedAtUtc' => null];
  }

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) {
    return ['enabled' => false, 'title' => null, 'message' => null, 'updatedAtUtc' => null];
  }

  $enabled = isset($parsed['enabled']) ? (bool)$parsed['enabled'] : false;
  $title = isset($parsed['title']) && is_string($parsed['title']) ? trim($parsed['title']) : null;
  $message = isset($parsed['message']) && is_string($parsed['message']) ? trim($parsed['message']) : null;
  $updated = isset($parsed['updatedAtUtc']) && is_string($parsed['updatedAtUtc']) ? trim($parsed['updatedAtUtc']) : null;

  return [
    'enabled' => $enabled,
    'title' => $title ?: null,
    'message' => $message ?: null,
    'updatedAtUtc' => $updated ?: null,
  ];
}

sendCors($ALLOWED_ORIGINS);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($method === 'GET') {
  jsonResponse(readStoredNotice($STORE_FILE), 200);
}

if ($method === 'PUT') {
  requireAuth($ADMIN_USER, $ADMIN_PASS);

  $raw = file_get_contents('php://input');
  if ($raw === false) jsonResponse(['error' => 'Could not read request body.'], 400);

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) jsonResponse(['error' => 'Invalid JSON.'], 400);

  $enabled = isset($parsed['enabled']) ? (bool)$parsed['enabled'] : false;
  $title = isset($parsed['title']) && is_string($parsed['title']) ? trim($parsed['title']) : '';
  $message = isset($parsed['message']) && is_string($parsed['message']) ? trim($parsed['message']) : '';

  if (strlen($title) > 80) jsonResponse(['error' => 'title must be 0-80 characters.'], 400);
  if (strlen($message) > 220) jsonResponse(['error' => 'message must be 0-220 characters.'], 400);

  if ($enabled && (!$title || !$message)) {
    jsonResponse(['error' => 'When enabled, title and message are required.'], 400);
  }

  $payload = [
    'enabled' => $enabled,
    'title' => $title ?: null,
    'message' => $message ?: null,
    'updatedAtUtc' => gmdate('c'),
  ];

  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($json === false) jsonResponse(['error' => 'Could not encode JSON.'], 500);
  if (strlen($json) > 8000) jsonResponse(['error' => 'Payload too large.'], 413);

  $ok = file_put_contents($STORE_FILE, $json, LOCK_EX);
  if ($ok === false) jsonResponse(['error' => 'Could not save incident notice.'], 500);

  jsonResponse(['ok' => true] + $payload, 200);
}

jsonResponse(['error' => 'Method not allowed'], 405);
