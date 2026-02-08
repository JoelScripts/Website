<?php
// Admin Notes API for FastHosts (PHP)
// - Protected: GET returns notes JSON (Basic auth)
// - Protected: PUT updates notes JSON (Basic auth)
//
// Shape:
//   { ok?: true, notes: string, updatedAtUtc: string|null }
//
// This is used by admin.html as a fallback when the Cloudflare Worker route is not available.

declare(strict_types=1);

$ALLOWED_ORIGINS = [
  'https://flyingwithjoel.co.uk',
  'https://www.flyingwithjoel.co.uk',
];

$STORE_FILE = __DIR__ . DIRECTORY_SEPARATOR . 'admin_notes.store.json';

// Prefer dedicated env vars, but fall back to the schedule creds.
$ADMIN_USER = getenv('ADMIN_NOTES_USERNAME') ?: (getenv('SCHEDULE_ADMIN_USERNAME') ?: '');
$ADMIN_PASS = getenv('ADMIN_NOTES_PASSWORD') ?: (getenv('SCHEDULE_ADMIN_PASSWORD') ?: '');

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
    header('WWW-Authenticate: Basic realm="Admin Notes"');
    jsonResponse(['error' => 'Unauthorized'], 401);
  }
}

function readStoredNotes(string $storeFile): array {
  if (!file_exists($storeFile)) return ['notes' => '', 'updatedAtUtc' => null];
  $raw = file_get_contents($storeFile);
  if ($raw === false) return ['notes' => '', 'updatedAtUtc' => null];
  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) return ['notes' => '', 'updatedAtUtc' => null];

  $notes = isset($parsed['notes']) && is_string($parsed['notes']) ? $parsed['notes'] : '';
  $updated = isset($parsed['updatedAtUtc']) && is_string($parsed['updatedAtUtc']) ? trim($parsed['updatedAtUtc']) : null;

  return [
    'notes' => $notes,
    'updatedAtUtc' => $updated ?: null,
  ];
}

sendCors($ALLOWED_ORIGINS);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
  http_response_code(204);
  exit;
}

requireAuth($ADMIN_USER, $ADMIN_PASS);

if ($method === 'GET') {
  $stored = readStoredNotes($STORE_FILE);
  jsonResponse(['ok' => true, 'notes' => $stored['notes'], 'updatedAtUtc' => $stored['updatedAtUtc']], 200);
}

if ($method === 'PUT') {
  $raw = file_get_contents('php://input');
  if ($raw === false) jsonResponse(['error' => 'Could not read request body.'], 400);

  $parsed = json_decode($raw, true);
  if (!is_array($parsed)) jsonResponse(['error' => 'Invalid JSON.'], 400);

  $notes = isset($parsed['notes']) && is_string($parsed['notes']) ? $parsed['notes'] : '';
  if (strlen($notes) > 20000) jsonResponse(['error' => 'notes must be 0-20000 characters.'], 400);

  $payload = [
    'notes' => $notes,
    'updatedAtUtc' => gmdate('c'),
  ];

  $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
  if ($json === false) jsonResponse(['error' => 'Could not encode JSON.'], 500);

  $ok = file_put_contents($STORE_FILE, $json, LOCK_EX);
  if ($ok === false) jsonResponse(['error' => 'Could not save notes.'], 500);

  jsonResponse(['ok' => true, 'updatedAtUtc' => $payload['updatedAtUtc']], 200);
}

jsonResponse(['error' => 'Method not allowed'], 405);
