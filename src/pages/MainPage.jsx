import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

// Database will be loaded from public/data/callsigns.json
let databaseSet = null
let databaseLoaded = false
let databaseInfo = null // { count: number, lastSync: string }

function loadDatabase() {
  if (databaseLoaded) return Promise.resolve()

  return fetch(`${import.meta.env.BASE_URL}data/callsigns.json`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to load database')
      return res.json()
    })
    .then(response => {
      // Extract data from wrapped format
      const callsigns = response.data || []
      // Create a Set for O(1) lookups
      databaseSet = new Set(callsigns.map(row => row.callsign))
      databaseInfo = {
        count: response.meta?.count || callsigns.length,
        lastSync: response.meta?.lastSync || null
      }
      databaseLoaded = true
    })
}

function getDigits(region) {
  return region === 'south'
    ? ['1', '3', '5', '7', '9']
    : ['2', '4', '6', '8']
}

function generateSuffixes(prefix, missing, letters = null) {
  if (missing === 0) return [prefix]

  if (!letters) {
    letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)) // A-Z
  }

  const result = []
  const limit = 10000 // prevent infinite generation

  function generate(current, remaining) {
    if (result.length >= limit) return

    if (remaining === 0) {
      result.push(current)
      return
    }

    for (const letter of letters) {
      generate(current + letter, remaining - 1)
      if (result.length >= limit) break
    }
  }

  generate(prefix, missing)
  return result
}

// Format ISO date to Bulgarian format: DD.MM.YYYY HH:MM UTC
function formatLastSync(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const day = date.getUTCDate().toString().padStart(2, '0')
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const year = date.getUTCFullYear()
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes} UTC`
}

function MainPage() {
  const [region, setRegion] = useState('south')
  const [length, setLength] = useState('2')
  const [suffix, setSuffix] = useState('')
  const [results, setResults] = useState([])
  const [digits, setDigits] = useState(['1', '3', '5', '7', '9'])
  const [status, setStatus] = useState('')
  const [dbStatus, setDbStatus] = useState('Зареждане на данни...')
  const [lastSync, setLastSync] = useState(null)
  const [recordCount, setRecordCount] = useState(null)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Load database on mount
  useEffect(() => {
    loadDatabase()
      .then(() => {
        setDbStatus('')
        if (databaseInfo) {
          setLastSync(databaseInfo.lastSync)
          setRecordCount(databaseInfo.count)
        }
      })
      .catch(err => {
        console.error('Грешка при зареждане на данни:', err)
        setDbStatus('Грешка при зареждането на данни')
      })
  }, [])

  // Update digits when region changes
  useEffect(() => {
    setDigits(getDigits(region))
  }, [region])

  const runSearch = useCallback(() => {
    if (!databaseLoaded) {
      setStatus('Зареждане на данни...')
      return
    }

    // If suffix is empty, we'll search for ALL possible combinations
    setStatus('Търсене...')

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const cleanSuffix = suffix.replace(/[^A-Z]/g, '').toUpperCase()
      const suffixLen = parseInt(length)
      const trimmedSuffix = cleanSuffix.substring(0, suffixLen)
      const currentDigits = getDigits(region)

      // Generate all possible suffix combinations
      const missing = suffixLen - trimmedSuffix.length
      let allSuffixes = generateSuffixes(trimmedSuffix, missing)

      // Build results
      const rows = []

      for (const sfx of allSuffixes) {
        const freeDigits = []

        for (const d of currentDigits) {
          const cs = `LZ${d}${sfx}`
          if (!databaseSet.has(cs)) {
            freeDigits.push(d)
          }
        }

        if (freeDigits.length > 0) {
          rows.push({
            suffix: sfx,
            free: freeDigits
          })
        }
      }

      setResults(rows)
      setStatus(`Намерени са ${rows.length} отговарящи суфикса`)
    }, 0)
  }, [suffix, length, region])

  // Debounced search (only after user interaction)
  useEffect(() => {
    if (!hasInteracted) return
    const timer = setTimeout(runSearch, 300)
    return () => clearTimeout(timer)
  }, [suffix, length, region, hasInteracted, runSearch])

  // Handle Enter key on suffix input
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!hasInteracted) setHasInteracted(true)
      runSearch()
    }
  }

  const copyCallsign = async (callsign, element) => {
    try {
      await navigator.clipboard.writeText(callsign)

      const span = element.querySelector('span')
      const original = span.textContent
      span.innerHTML = '<i class="bi bi-clipboard2-check"></i>'

      setTimeout(() => {
        span.textContent = original
      }, 800)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const getPlaceholder = () => {
    const placeholders = {
      1: 'A',
      2: 'A, AB',
      3: 'A, AB, ABC'
    }
    return placeholders[length] || ''
  }

  const handleSuffixChange = (e) => {
    let value = e.target.value.toUpperCase()
    value = value.replace(/[^A-Z]/g, '')
    const maxLen = parseInt(length)
    value = value.substring(0, maxLen)
    setSuffix(value)
    if (!hasInteracted) {
      setHasInteracted(true)
    }
  }

  if (dbStatus) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">{dbStatus}</div>
      </div>
    )
  }

  return (
    <div>
      {/* Controls Card */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-end lg:items-center">
          {/* Region Select */}
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Регион
            </label>
            <div className="relative">
              <select
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value)
                  if (!hasInteracted) setHasInteracted(true)
                }}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl text-white appearance-none cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="south">Южна България (1,3,5,7,9)</option>
                <option value="north">Северна България (2,4,6,8)</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Length Select */}
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Дължина на суфикс
            </label>
            <div className="relative">
              <select
                value={length}
                onChange={(e) => {
                  setLength(e.target.value)
                  if (!hasInteracted) setHasInteracted(true)
                }}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl text-white appearance-none cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="1">1 знак (временен)</option>
                <option value="2">2 знака</option>
                <option value="3">3 знака</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Suffix Input with Search Button */}
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Търсен суфикс
            </label>
            <div className="relative">
              <div className="flex">
                <input
                  id="suffix-input"
                  type="text"
                  value={suffix}
                  onChange={handleSuffixChange}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholder()}
                  className="flex-1 px-4 py-3 bg-gray-900 border border-r-0 border-gray-600 rounded-l-xl text-white uppercase placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  maxLength={parseInt(length)}
                  autoComplete="off"
                />
                <button
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 border border-l-0 border-gray-600 rounded-r-xl text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 flex items-center gap-2"
                  type="button"
                  onClick={() => {
                    if (!hasInteracted) setHasInteracted(true)
                    runSearch()
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Търсене</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="mb-6 text-center">
          <div className="inline-block px-4 py-2 bg-blue-900/30 border border-blue-700/50 rounded-lg text-blue-200 text-sm">
            {status}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length === 0 && suffix ? (
        <div className="text-center py-12">
          <div className="inline-block px-6 py-4 bg-gray-800/50 border border-gray-700 rounded-xl">
            <p className="text-gray-400 text-lg">No available callsigns found</p>
            <p className="text-gray-500 text-sm mt-1">Try a different suffix pattern</p>
          </div>
        </div>
      ) : results.length > 0 ? (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/50">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">
                    Suffix
                  </th>
                  {digits.map(d => (
                    <th key={d} className="px-2 py-2 text-center text-sm font-semibold text-gray-300 uppercase tracking-wider min-w-25">
                      LZ{d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {results.map(row => (
                  <tr key={row.suffix} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-2 font-mono text-lg font-bold text-white">
                      {row.suffix}
                    </td>
                    {digits.map(d => {
                      const cs = `LZ${d}${row.suffix}`
                      if (row.free.includes(d)) {
                        return (
                          <td
                            key={d}
                            className="px-1 py-1 text-center"
                          >
                            <button
                              onClick={(e) => copyCallsign(cs, e.currentTarget)}
                              className="inline-flex items-center justify-center w-full py-1 px-1 bg-green-900/40 hover:bg-green-800/60 border border-green-600/50 rounded-md text-green-100 font-mono font-bold text-lg transition-all hover:scale-105 active:scale-95 cursor-pointer group"
                            >
                              <span>{cs}</span>
                            </button>
                          </td>
                        )
                      } else {
                        return (
                          <td key={d} className="px-1 py-1">
                            <div className="h-9 bg-red-900/20 border border-red-900/30 rounded-md"></div>
                          </td>
                        )
                      }
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !suffix && (
          <div className="text-center py-20">
            <div className="inline-block p-6 bg-gray-800/30 border border-gray-700/50 rounded-2xl">
              <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-gray-400 text-lg">Въведете суфикс, за да започнете</p>
              <p className="text-gray-500 text-sm mt-1">Свободните опознавателни знаци ще се покажат тук.</p>
            </div>
          </div>
        )
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm">
        <p className="text-gray-500">
          Данните са извлечени от{' '}
          <a
            href="http://91.132.60.93:8080/ords/f?p=723:140"
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="text-blue-400 font-semibold hover:text-blue-300 transition-colors underline decoration-blue-700/50 hover:decoration-blue-500/50"
          >
            Комисия за регулиране на съобщенията
          </a>
        </p>
        {lastSync && (
          <p className="text-gray-600 text-xs mt-2">
            Обновени: {formatLastSync(lastSync)}{recordCount && ` (${recordCount.toLocaleString()} записи)`}
            
          </p>
        )}
        
        {lastSync && (
          <p className='text-gray-600 text-xs mt-2'>
            <Link
              to="/diff"
              className="
                        text-sm text-gray-400
                        hover:text-white
                        transition
                    "
            >
              Журнал на промените
            </Link>
          </p>
        )
        
        }
      </div>
    </div>
  )
}

export default MainPage
