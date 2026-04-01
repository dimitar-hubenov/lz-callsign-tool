<?php

header('Content-Type: application/json');

$db = new PDO("sqlite:" . __DIR__ . "/data/callsigns.sqlite");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// ==============================
// INPUT
// ==============================
$suffix = strtoupper(trim($_GET['suffix'] ?? ''));
$length = (int)($_GET['length'] ?? 2);
$digits = isset($_GET['digits']) ? explode(',', $_GET['digits']) : [];

// sanitize
$suffix = preg_replace('/[^A-Z]/', '', $suffix);

// limit suffix length to selected length
$suffix = substr($suffix, 0, $length);

// fallback digits
if (empty($digits)) {
    $digits = ["1","3","5","7","9"];
}

// ==============================
// LOAD ALL CALLSIGNS (FAST LOOKUP)
// ==============================
$all = $db->query("SELECT callsign FROM callsigns")
          ->fetchAll(PDO::FETCH_COLUMN);

$set = array_flip($all); // O(1) lookup

// ==============================
// GENERATE SUFFIXES
// ==============================
$letters = range('A', 'Z');
$suffixes = [];

// how many missing chars
$missing = $length - strlen($suffix);

// recursive generator
function generateSuffixes($prefix, $remaining, $letters, &$result, $limit = 10000) {
    if (count($result) >= $limit) return;

    if ($remaining === 0) {
        $result[] = $prefix;
        return;
    }

    foreach ($letters as $l) {
        generateSuffixes($prefix . $l, $remaining - 1, $letters, $result, $limit);
        if (count($result) >= $limit) return;
    }
}

// generate suffix list
if ($missing === 0) {
    // strict
    $suffixes[] = $suffix;
} else {
    generateSuffixes($suffix, $missing, $letters, $suffixes);
}

// ==============================
// BUILD TABLE ROWS
// ==============================
$rows = [];

foreach ($suffixes as $sfx) {

    $freeDigits = [];

    foreach ($digits as $d) {
        $cs = "LZ" . $d . $sfx;

        if (!isset($set[$cs])) {
            $freeDigits[] = $d;
        }
    }

    // include row only if at least one free
    if (!empty($freeDigits)) {
        $rows[] = [
            "suffix" => $sfx,
            "free"   => $freeDigits
        ];
    }
}

// ==============================
// OUTPUT
// ==============================
echo json_encode([
    "digits" => array_values($digits),
    "rows"   => $rows
]);