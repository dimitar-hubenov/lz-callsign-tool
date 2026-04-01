<?php

// ==============================
// CONFIG
// ==============================
$baseUrl = "http://91.132.60.93:8080/ords/f?p=723:140";
$dbFile  = __DIR__ . "/data/callsigns.sqlite";
$cookies = __DIR__ . "/data/cookies.txt";

// ==============================
// STEP 1: GET SESSION (p_instance)
// ==============================
function getSessionId($url, $cookiesFile) {
    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $cookiesFile,
        CURLOPT_COOKIEFILE => $cookiesFile,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
    ]);

    $html = curl_exec($ch);

    if ($html === false) {
        throw new Exception("Failed to load initial page: " . curl_error($ch));
    }

    curl_close($ch);

    if (!preg_match('/name="p_instance"\s+value="(\d+)"/', $html, $m)) {
        throw new Exception("Session ID (p_instance) not found");
    }

    return $m[1];
}

// ==============================
// STEP 2: DOWNLOAD HTML EXPORT
// ==============================
function downloadExport($session, $cookiesFile) {
    $url = "http://91.132.60.93:8080/ords/f?p=723:140:$session:HTMLD_Y::::";

    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEFILE => $cookiesFile,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
    ]);

    $html = curl_exec($ch);

    if ($html === false) {
        throw new Exception("Failed to download export: " . curl_error($ch));
    }

    curl_close($ch);

    return $html;
}

// ==============================
// STEP 3: PARSE HTML TABLE
// ==============================
function parseTable($html) {
    libxml_use_internal_errors(true);

    // Force proper encoding handling
    $html = mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8');

    $dom = new DOMDocument();
    $dom->loadHTML($html);

    $xpath = new DOMXPath($dom);

    // 🔥 Target ONLY the real data table
    $rows = $xpath->query("//tbody[@id='data']/tr");

    $data = [];

    foreach ($rows as $row) {
        $cells = $row->getElementsByTagName("td");

        if ($cells->length < 6) {
            continue; // skip malformed rows
        }

        $get = function($i) use ($cells) {
            return trim(html_entity_decode($cells->item($i)->textContent, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        };

        $data[] = [
            'callsign'        => $get(0),
            'type'            => $get(1),
            'class'           => $get(2),
            'responsible'     => $get(3),
            'club_name'       => $get(4),
            'address'         => $get(5),
        ];
    }

    return $data;
}

// ==============================
// STEP 4: STORE IN SQLITE
// ==============================
function saveToSQLite($dbFile, $data) {
    if (empty($data)) {
        throw new Exception("No data parsed — aborting DB update");
    }

    // check for duplicates
    $seen = [];
    $duplicates = [];

    foreach ($data as $row) {
        $cs = $row['callsign'];

        if (isset($seen[$cs])) {
            $duplicates[] = $cs;
        } else {
            $seen[$cs] = true;
        }
    }

    if (!empty($duplicates)) {
        echo "Duplicates found:\n";
        print_r(array_unique($duplicates));
    }


    $pdo = new PDO("sqlite:" . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create table if not exists
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS callsigns (
            callsign TEXT PRIMARY KEY,
            type TEXT,
            class TEXT,
            responsible TEXT,
            club_name TEXT,
            address TEXT
        )
    ");

    try {
        $pdo->beginTransaction();

        $pdo->exec("DELETE FROM callsigns");

        $stmt = $pdo->prepare("
            INSERT INTO callsigns 
            (callsign, type, class, responsible, club_name, address)
            VALUES 
            (:callsign, :type, :class, :responsible, :club_name, :address)
        ");

        $unique = [];

        foreach ($data as $row) {
            if (empty($row['callsign'])) continue;

             // normalize callsign
            $cs = strtoupper(trim($row['callsign']));

            // remove non-breaking spaces
            $cs = str_replace("\xC2\xA0", '', $cs);

            // overwrite duplicates (last one wins)
            $unique[$cs] = [
                'callsign'    => $cs,
                'type'        => trim($row['type']),
                'class'       => trim($row['class']),
                'responsible' => trim($row['responsible']),
                'club_name'   => trim($row['club_name']),
                'address'     => trim($row['address']),
            ];
        }

        foreach ($unique as $row) {
            $stmt->execute([
                ':callsign'    => $row['callsign'],
                ':type'        => $row['type'],
                ':class'       => $row['class'],
                ':responsible' => $row['responsible'],
                ':club_name'   => $row['club_name'],
                ':address'     => $row['address'],
            ]);
        }

        $pdo->exec("
            CREATE INDEX IF NOT EXISTS idx_callsign 
            ON callsigns(callsign)
        ");

        $pdo->commit();

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// ==============================
// MAIN EXECUTION
// ==============================
try {
    echo "Getting session...\n";
    $session = getSessionId($baseUrl, $cookies);

    echo "Session: $session\n";

    echo "Downloading export...\n";
    $html = downloadExport($session, $cookies);

    echo "Parsing data...\n";
    $data = parseTable($html);

    echo "Rows parsed: " . count($data) . "\n";

    echo "Saving to SQLite...\n";
    saveToSQLite($dbFile, $data);

    echo "Done.\n";

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}