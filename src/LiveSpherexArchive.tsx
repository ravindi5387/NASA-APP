import { useEffect, useMemo, useState } from 'react'

type ArchiveRecord = {
  id: string
  observationStart: string | null
  observationEnd: string | null
  target: string | null
  instrument: string | null
  collection: string | null
  ra: string | null
  dec: string | null
  wavelengthMin: string | null
  wavelengthMax: string | null
  accessUrl: string
  dataProductType: string | null
  calibrationLevel: string | null
}
type SearchResult = {
  query: { ra: number; dec: number; radiusArcmin: number; release: string; collection: string }
  count: number
  results: ArchiveRecord[]
  provenance: string
  archiveUrl: string
  notice: string
  productKind?: string
}

const API = (import.meta.env.VITE_SPHEREX_API_URL || '').replace(/\/$/, '')
const releases = ['DR1 All-Sky', 'DR1 Deep', 'DR1 102-Channel All-Sky Cube', 'QR3 Wide', 'QR3 Deep']

function downloadCsv(records: ArchiveRecord[]) {
  const columns: (keyof ArchiveRecord)[] = ['id', 'observationStart', 'observationEnd', 'target', 'instrument', 'collection', 'ra', 'dec', 'wavelengthMin', 'wavelengthMax', 'accessUrl']
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [columns.join(','), ...records.map(row => columns.map(key => quote(row[key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'galaxy-divers-spherex-archive-results.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function LiveSpherexArchive({ ra, dec, searchKey = 0 }: { ra: number; dec: number; searchKey?: number }) {
  const [radius, setRadius] = useState(30)
  const [release, setRelease] = useState('DR1 All-Sky')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const visible = useMemo(() => {
    const rows = result?.results ?? []
    const term = filter.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(row => [row.id, row.target, row.instrument, row.collection, row.observationStart].some(v => (v || '').toLowerCase().includes(term)))
  }, [result, filter])

  async function runSearch() {
    setBusy(true); setError(''); setResult(null); setSelected(null)
    try {
      const params = new URLSearchParams({ ra: String(ra), dec: String(dec), radius_arcmin: String(radius), release, limit: '100' })
      const response = await fetch(`${API}/api/spherex/search?${params}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(135000),
      })
      const contentType = response.headers.get('content-type') || ''
      const raw = await response.text()
      let body: any = null
      if (contentType.includes('application/json')) {
        try { body = JSON.parse(raw) } catch { /* handled below */ }
      }
      if (!response.ok) {
        const detail = body?.detail || (raw.startsWith('<')
          ? 'The request returned an HTML page instead of API JSON. The Python backend is probably stopped, or the /api proxy is not configured.'
          : raw.slice(0, 350))
        throw new Error(`${detail} (HTTP ${response.status})`)
      }
      if (!body || typeof body !== 'object') {
        throw new Error('The server did not return JSON. Start the FastAPI backend on http://127.0.0.1:8000 and retry.')
      }
      setResult(body as SearchResult)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect to the SPHEREx archive service.'
      const isNetwork = e instanceof TypeError || /Failed to fetch|NetworkError|timeout/i.test(message)
      setError(isNetwork
        ? `${message}. Start the Python API in a second terminal: py -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`
        : message)
    } finally { setBusy(false) }
  }

  useEffect(() => { if (searchKey > 0) void runSearch() }, [searchKey])

  return <section className="archive-panel" aria-labelledby="archive-title">
    <div className="archive-heading">
      <div><span className="archive-eyebrow">MISSION DATA · LIVE ARCHIVE</span><h2 id="archive-title">NASA SPHEREx Data Observatory</h2>
        <p>Search released SPHEREx spectral-image observations around your selected sky position. DR1 All-Sky is the default release.</p></div>
      <span className="archive-live"><i /> IRSA CONNECTOR</span>
    </div>
    <div className="archive-query-grid">
      <div className="archive-coordinate"><span>RIGHT ASCENSION</span><strong>{ra.toFixed(6)}°</strong></div>
      <div className="archive-coordinate"><span>DECLINATION</span><strong>{dec.toFixed(6)}°</strong></div>
      <label>DATA RELEASE<select value={release} onChange={e => setRelease(e.target.value)}>{releases.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>SEARCH RADIUS<select value={radius} onChange={e => setRadius(Number(e.target.value))}>{[0.5, 1, 2, 5, 10, 30, 60].map(x => <option key={x} value={x}>{x} arcmin</option>)}</select></label>
      <button className="archive-search-btn" onClick={runSearch} disabled={busy}>{busy ? 'QUERYING IRSA…' : '⌕  SEARCH SPHEREx DATA'}</button>
    </div>
    {busy && <div className="archive-loading"><span className="archive-spinner" /> Querying NASA/IPAC IRSA SIA2. The archive may take a moment to respond.</div>}
    {error && <div className="archive-error" role="alert"><strong>Archive connection issue</strong><span>{error}</span><small>Local API: {API || 'same-origin /api (Vite proxy → http://127.0.0.1:8000)'}.</small></div>}
    {result && <div className="archive-results">
      <div className="archive-result-top"><div><strong>{result.count}</strong><span> archive products found</span><small>{result.query.collection} · {result.productKind || 'archive products'} · {result.query.radiusArcmin} arcmin cone</small></div>
        {result.results.length > 0 && <button className="archive-export" onClick={() => downloadCsv(result.results)}>↓ Export CSV</button>}</div>
      {result.results.length > 0 && <input className="archive-filter" aria-label="Filter archive results" placeholder="Filter by target, observation ID, date…" value={filter} onChange={e => setFilter(e.target.value)} />}
      {visible.length === 0 ? <div className="archive-empty">IRSA returned no products for this exact search. Try a wider radius, another nearby coordinate, or QR3. Archive coverage is not guaranteed for every target.</div> :
        <div className="archive-record-list">{visible.map((row, i) => <article className={`archive-record ${selected === row.id ? 'is-selected' : ''}`} key={`${row.id}-${i}`}>
          <button className="archive-record-main" onClick={() => setSelected(selected === row.id ? null : row.id)} aria-expanded={selected === row.id}>
            <span className="archive-record-index">{String(i + 1).padStart(2, '0')}</span>
            <span className="archive-record-copy"><strong>{row.target || row.id || `SPHEREx product ${i + 1}`}</strong><small>{row.observationStart || 'Observation time not supplied'}{row.instrument ? ` · ${row.instrument}` : ''}</small></span>
            <span className="archive-record-chevron">{selected === row.id ? '−' : '+'}</span>
          </button>
          {selected === row.id && <div className="archive-record-details">
            <dl><div><dt>Product ID</dt><dd>{row.id}</dd></div><div><dt>Collection</dt><dd>{row.collection || result.query.collection}</dd></div><div><dt>Observation end</dt><dd>{row.observationEnd || 'Not supplied'}</dd></div><div><dt>Sky position</dt><dd>{row.ra || '—'}, {row.dec || '—'}</dd></div><div><dt>Wavelength bounds</dt><dd>{row.wavelengthMin || '—'} – {row.wavelengthMax || '—'} m</dd></div><div><dt>Calibration level</dt><dd>{row.calibrationLevel || '—'}</dd></div></dl>
            <a className="archive-download" href={`/api/spherex/download?url=${encodeURIComponent(row.accessUrl)}`}>↓ Download original FITS for analysis</a> <a className="archive-download" href={row.accessUrl} target="_blank" rel="noreferrer">↗ Open original IRSA product</a>
          </div>}
        </article>)}</div>}
      <p className="archive-provenance">SOURCE: {result.provenance} · <a href={result.archiveUrl} target="_blank" rel="noreferrer">IRSA SIA2 service</a></p>
      <p className="archive-caveat">{result.notice}</p>
    </div>}
    {!result && !busy && !error && <div className="archive-idle"><span>✦</span><div><strong>Ready to explore the infrared sky</strong><p>Run a live query to discover real SPHEREx spectral-image products for the current coordinates.</p></div></div>}
    <div className="archive-footer"><span>DATA PROVENANCE: NASA/IPAC IRSA</span><span>NO DEMO DATA IN THIS SEARCH PANEL</span></div>
  </section>
}
