#!/usr/bin/env node

import https from 'https'
import http from 'http'
import { URL } from 'url'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { resolve } from 'path'
import * as cheerio from 'cheerio'

// Simple cookie jar implementation
class CookieJar {
  constructor() {
    this.cookies = new Map() // key: domain+path, value: cookie string
  }

  setCookiesFromResponse(url, headers) {
    const urlObj = new URL(url)
    const setCookie = headers['set-cookie']
    if (!setCookie) return

    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]

    for (const cookieStr of cookies) {
      const cookieParts = cookieStr.split(';')[0].trim()
      if (cookieParts) {
        const key = `${urlObj.hostname}${urlObj.pathname}`
        this.cookies.set(key, cookieStr)
      }
    }
  }

  getCookiesForUrl(url) {
    const urlObj = new URL(url)
    const cookies = []

    // Get all relevant cookies (any path that is prefix of current path)
    for (const [key, cookie] of this.cookies.entries()) {
      const [domain, path] = key.split(urlObj.pathname)
      if (domain === urlObj.hostname && (path === '' || urlObj.pathname.startsWith(path))) {
        cookies.push(cookie)
      }
    }

    return cookies.join('; ')
  }
}

// ==============================
// CONFIG
// ==============================
const BASE_URL = 'http://91.132.60.93:8080/ords/f?p=723:140'
const DATA_DIR = resolve(process.cwd(), 'public/data')
const OUTPUT_FILE = resolve(DATA_DIR, 'callsigns.json')
const COOKIES_FILE = resolve(process.cwd(), 'data/cookies.txt')

// ==============================
// HELPER: HTTP Request (with redirect support and cookies)
// ==============================
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects || 10
    const redirects = []
    const cookieJar = options.cookieJar

    const makeRequest = (currentUrl, redirectCount = 0) => {
      const urlObj = new URL(currentUrl)
      const lib = urlObj.protocol === 'https:' ? https : http

      // Add cookies if we have a cookie jar
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...options.headers
      }

      if (cookieJar) {
        const cookies = cookieJar.getCookiesForUrl(currentUrl)
        if (cookies) {
          headers.Cookie = cookies
        }
      }

      const req = lib.get(currentUrl, { headers }, (res) => {
        // Store cookies from response
        if (cookieJar) {
          cookieJar.setCookiesFromResponse(currentUrl, res.headers)
        }

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirectCount < maxRedirects) {
          const location = res.headers.location
          if (!location) {
            return reject(new Error(`Redirect (${res.statusCode}) without Location header`))
          }

          console.log(`Following redirect ${redirectCount + 1}/${maxRedirects}: ${currentUrl} -> ${location}`)

          // Must consume response data to free socket
          res.on('data', () => {})
          res.on('end', () => {
            redirects.push({ from: currentUrl, to: location, status: res.statusCode })
            makeRequest(location, redirectCount + 1)
          })
          return
        }

        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            redirects: redirects.length ? redirects : undefined
          })
        })
      })

      req.on('error', reject)
      req.setTimeout(60000, () => req.destroy())
    }

    makeRequest(url)
  })
}

// ==============================
// STEP 1: Get session ID (p_instance)
// ==============================
async function getSessionId(cookieJar) {
  console.log('Getting session...')

  const res = await fetch(BASE_URL, {
    timeout: 30000,
    cookieJar,
    maxRedirects: 10
  })

  if (res.statusCode !== 200) {
    throw new Error(`Failed to load initial page: HTTP ${res.statusCode}`)
  }

  const match = res.body.match(/name="p_instance"\s+value="(\d+)"/)
  if (!match) {
    // Debug: show part of the HTML to understand what we got
    console.error('Session ID not found in response. HTML preview:')
    console.error(res.body.substring(0, 500))
    throw new Error('Session ID (p_instance) not found')
  }

  const sessionId = match[1]
  console.log(`Session: ${sessionId}`)
  return sessionId
}

// ==============================
// STEP 2: Download HTML export
// ==============================
async function downloadExport(sessionId, cookieJar) {
  console.log('Downloading export...')

  const exportUrl = `http://91.132.60.93:8080/ords/f?p=723:140:${sessionId}:HTMLD_Y::::`
  const res = await fetch(exportUrl, {
    timeout: 60000,
    cookieJar,
    maxRedirects: 10
  })

  if (res.statusCode !== 200) {
    throw new Error(`Failed to download export: HTTP ${res.statusCode}`)
  }

  return res.body
}

// ==============================
// STEP 3: Parse HTML table
// ==============================
function parseTable(html) {
  // Encode to handle special characters properly
  const $ = cheerio.load(html, { decodeEntities: true })

  // Target tbody with id="data"
  const rows = $('#data tr')
  const data = []

  rows.each((_, row) => {
    const cells = $(row).find('td')

    if (cells.length < 6) return

    const rowData = {
      callsign: $(cells[0]).text().trim(),
      type: $(cells[1]).text().trim(),
      class: $(cells[2]).text().trim(),
      responsible: $(cells[3]).text().trim(),
      club_name: $(cells[4]).text().trim(),
      address: $(cells[5]).text().trim()
    }

    data.push(rowData)
  })

  return data
}

// ==============================
// STEP 4: Normalize and deduplicate
// ==============================
function normalizeData(rows) {
  const unique = new Map()

  for (const row of rows) {
    if (!row.callsign) continue

    const cs = row.callsign
      .toUpperCase()
      .trim()
      .replace(/\u00A0/g, '') // remove non-breaking spaces

    unique.set(cs, {
      callsign: cs,
      type: row.type?.trim() || '',
      class: row.class?.trim() || '',
      responsible: row.responsible?.trim() || '',
      club_name: row.club_name?.trim() || '',
      address: row.address?.trim() || ''
    })
  }

  return Array.from(unique.values())
}

// ==============================
// STEP 5: Save to JSON (with metadata)
// ==============================
async function saveToJson(data, lastSync) {
  if (data.length === 0) {
    throw new Error('No data to save')
  }

  // Ensure public/data directory exists
  await mkdir(DATA_DIR, { recursive: true })

  // Wrap data with metadata
  const output = {
    meta: {
      lastSync: lastSync.toISOString(),
      count: data.length
    },
    data: data
  }

  // Write JSON file with pretty formatting
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')

  console.log(`Saved ${data.length} callsigns to ${OUTPUT_FILE}`)
}

// ==============================
// MAIN
// ==============================
async function main() {
  const cookieJar = new CookieJar();
  const diffPath = resolve(DATA_DIR, 'callsigns-diff.json');
  let previousData = [];
  let skipDiff = false;

  // Load previous callsigns snapshot if exists
  try {
    const prevRaw = await readFile(OUTPUT_FILE, 'utf8');
    const prevJson = JSON.parse(prevRaw);
    previousData = prevJson.data || [];
  } catch (e) {
    // No previous file - start fresh
    previousData = [];
  }

  // Load existing diff if possible, handling missing or corrupted file gracefully
  let diffArray = [];
  try {
    const diffRaw = await readFile(diffPath, 'utf8');
    diffArray = JSON.parse(diffRaw);
    if (!Array.isArray(diffArray)) throw new Error('diff.json not an array');
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Diff file does not exist – start with an empty diff array
      console.warn('Diff file not found – starting with empty diff');
      diffArray = [];
    } else {
      console.warn('Diff file is corrupted – attempting repair');
      // Attempt a simple repair: extract JSON array between first '[' and last ']'
      try {
        const raw = await readFile(diffPath, 'utf8');
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          const candidate = raw.substring(start, end + 1);
          diffArray = JSON.parse(candidate);
          console.log('Diff file repaired successfully');
        } else {
          throw new Error('No recognizable array in diff file');
        }
      } catch (repairErr) {
        // If repair fails, archive the corrupted file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = resolve(DATA_DIR, `callsigns-diff-${timestamp}.json`);
        try {
          await writeFile(backupPath, await readFile(diffPath, 'utf8'));
          console.warn(`Corrupted diff backed up to ${backupPath}`);
        } catch (_) {}
        // Start with a clean diff array for this run
        diffArray = [];
      }
    }
    // Diff array is now either empty or repaired
  }

  try {
    const sessionId = await getSessionId(cookieJar);
    const html = await downloadExport(sessionId, cookieJar);
    const rows = parseTable(html);
    console.log(`Parsed ${rows.length} rows`);

    const normalized = normalizeData(rows);

    // Compute diff between previousData and normalized
    const prevMap = new Map(previousData.map(r => [r.callsign, r]));
    const newMap = new Map(normalized.map(r => [r.callsign, r]));
    const now = new Date().toISOString();
    const changes = [];
    // Added
    for (const [cs, rec] of newMap) {
      if (!prevMap.has(cs)) {
        changes.push({ callsign: cs, type: 'added', timestamp: now, record: rec });
      }
    }
    // Removed
    for (const [cs, rec] of prevMap) {
      if (!newMap.has(cs)) {
        changes.push({ callsign: cs, type: 'removed', timestamp: now, record: rec });
      }
    }
    // Compute counts
    const addedCount = changes.filter(c => c.type === 'added').length;
    const removedCount = changes.filter(c => c.type === 'removed').length;

    // Update diff file (always write, even if no changes, to ensure a clean file)
    if (changes.length > 0) {
      diffArray.push(...changes);
    }
    await writeFile(diffPath, JSON.stringify(diffArray, null, 2), 'utf-8');
    console.log(`Diff file written this sync run: ${addedCount} added, ${removedCount} removed`);

    await saveToJson(normalized, new Date());
    console.log('Sync complete!');
    process.exit(0);

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

main();
