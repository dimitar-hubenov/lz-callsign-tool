import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Load diff JSON (callsigns-diff.json)
function loadDiff() {
  return fetch(`${import.meta.env.BASE_URL}data/callsigns-diff.json`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to load diff');
      return res.json();
    })
    .then(json => json || []);
}

function formatDate(iso) {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function DiffPage() {
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState('date'); // date | action | callsign
  const [asc, setAsc] = useState(true);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadDiff()
      .then(data => {
        const transformed = data.map(item => ({
          date: formatDate(item.timestamp),
          action: item.type,
          callsign: item.callsign,
          rawDate: item.timestamp,
        }));
        setRows(transformed);
      })
      .catch(err => console.error('Error loading diff:', err));
  }, []);

  const sortBy = key => {
    if (key === sortKey) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const sorted = [...rows].sort((a, b) => {
    let result = 0;
    if (sortKey === 'date') {
      result = new Date(a.rawDate) - new Date(b.rawDate);
    } else {
      result = a[sortKey].localeCompare(b[sortKey]);
    }
    return asc ? result : -result;
  });

  // Reset to first page when sorting or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [sortKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen py-4 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">История на промените</h1>
          <Link to="/" className="text-blue-300 hover:underline">← Назад</Link>
        </div>
        <div className="overflow-x-auto bg-gray-800/50 rounded-2xl shadow-2xl border border-gray-700">
          <table className="w-full text-white">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-4 py-2 cursor-pointer text-left" onClick={() => sortBy('date')}><div className="flex items-center whitespace-nowrap"><span>Дата</span><span className="ml-1 text-xs">{sortKey === 'date' ? (asc ? '▲' : '▼') : ''}</span></div></th>
                <th className="px-4 py-2 cursor-pointer text-left" onClick={() => sortBy('action')}><div className="flex items-center whitespace-nowrap"><span>Действие</span><span className="ml-1 text-xs">{sortKey === 'action' ? (asc ? '▲' : '▼') : ''}</span></div></th>
                <th className="px-4 py-2 cursor-pointer" onClick={() => sortBy('callsign')}><div className="flex items-center whitespace-nowrap"><span>Позивна</span><span className="ml-1 text-xs">{sortKey === 'callsign' ? (asc ? '▲' : '▼') : ''}</span></div></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r, i) => (
                <tr key={i} className={i % 2 ? 'bg-gray-800' : 'bg-gray-900'}>
                  <td className="px-4 py-2">{r.date}</td>
                  <td className="px-4 py-2 capitalize">{r.action}</td>
                  <td className="px-4 py-2 font-mono">{r.callsign}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination controls */}
        <div className="flex items-center justify-between mt-4 text-white">
          <div className="flex items-center space-x-2">
            <label htmlFor="pageSize" className="text-sm">Rows per page:</label>
            <select
              id="pageSize"
              className="bg-gray-700 text-white rounded px-2 py-1"
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
            >Prev</button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
            >Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiffPage
