import { useMemo, useState } from 'react'

type Analysis = {
  filename: string
  statistics: Record<string, number | string | null>
  background: { background: number | null; noise: number | null; threshold: number | null }
  wcsAvailable: boolean
  sources: Array<{ id: string; x: number; y: number; ra: number | null; dec: number | null; peak: number; snr: number }>
  sourceCount: number
  preview: string
  provenance: string
  algorithm: string
}
type Comparison = {
  first: string; second: string
  epochs: { first: string; second: string; deltaDays: number }
  alignment: { method: string; overlapFraction: number; backgroundOffsetApplied: number; photometricCalibration: boolean }
  firstSourceCount: number; secondSourceCount: number
  matchedSources: Array<{ firstId: string; secondId: string; separationArcsec: number; firstRa: number; firstDec: number; secondRa: number; secondDec: number; firstPeakExcess: number; secondPeakExcess: number; firstSNR: number; secondSNR: number; peakExcessDelta: number }>
  firstPreview: string
  secondAlignedPreview: string
  matchSummary: { matched: number; unmatchedFirst: number; unmatchedSecond: number; totalDetections: number }
  differenceHistogram: Array<{ binStart: number; binEnd: number; count: number }>
  differenceSourceCandidates: Array<{ id: string; ra: number | null; dec: number | null; snr: number; peak: number }>
  differencePreview: string
  motionCandidates: Array<{ firstId: string; secondId: string; displacementArcsec: number; rateArcsecPerDay: number; classification: string; firstRa: number; firstDec: number; secondRa: number; secondDec: number }>
  differenceStatistics: { median: number; std: number; maxAbs: number }
  provenance: string; caution: string
}

const API = '/api'

export function ResearchWorkbench({ standalone = false, embedded = false }: { standalone?: boolean; embedded?: boolean }) {
  const [mode, setMode] = useState<'single' | 'compare'>('compare')
  const [singleFile, setSingleFile] = useState<File | null>(null)
  const [firstFile, setFirstFile] = useState<File | null>(null)
  const [secondFile, setSecondFile] = useState<File | null>(null)
  const [firstEpoch, setFirstEpoch] = useState('2026-01-01')
  const [secondEpoch, setSecondEpoch] = useState('2026-06-01')
  const [sigma, setSigma] = useState(5)
  const [single, setSingle] = useState<Analysis | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'sources' | 'motion' | 'method'>('overview')
  const [selectedLightCurve, setSelectedLightCurve] = useState('')

  const candidateCount = comparison?.motionCandidates.length ?? 0
  const plot = useMemo(() => {
    if (!comparison?.motionCandidates.length) return null
    const points = comparison.motionCandidates.map((m) => ({ x: (m.firstRa + m.secondRa) / 2, y: (m.firstDec + m.secondDec) / 2, dx: m.secondRa - m.firstRa, dy: m.secondDec - m.firstDec, id: `${m.firstId} → ${m.secondId}` }))
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y))
    return points.map(p => ({ ...p, px: 36 + ((p.x - minX) / Math.max(maxX - minX, 1e-8)) * 330, py: 180 - ((p.y - minY) / Math.max(maxY - minY, 1e-8)) * 145 }))
  }, [comparison])

  async function readApiResponse(response: Response) {
    const raw = await response.text()
    let data: any = {}
    try { data = raw ? JSON.parse(raw) : {} } catch {
      throw new Error(`The analysis API returned a non-JSON response (HTTP ${response.status}). Check that the FastAPI backend is running on port 8000.`)
    }
    if (!response.ok) throw new Error(data.detail || data.message || `Analysis failed (HTTP ${response.status}).`)
    return data
  }

  function validateFits(file: File | null) {
    if (!file) return 'Select a FITS file for each observation epoch.'
    const name = file.name.toLowerCase()
    if (!(name.endsWith('.fits') || name.endsWith('.fit') || name.endsWith('.fts') || name.endsWith('.fits.gz') || name.endsWith('.fits.fz'))) return 'Unsupported file type. Choose a .fits, .fit, .fts, .fits.gz or .fits.fz file.'
    if (file.size > 120 * 1024 * 1024) return 'Each FITS file must be 120 MB or smaller.'
    return ''
  }

  async function analyzeOne() {
    const validation = validateFits(singleFile)
    if (validation) return setError(validation)
    setBusy(true); setError(''); setSingle(null)
    try {
      const form = new FormData(); form.append('file', singleFile!); form.append('sigma', String(sigma))
      const response = await fetch(`${API}/fits/analyze`, { method: 'POST', body: form })
      setSingle(await readApiResponse(response))
    } catch (e) { setError(e instanceof Error ? e.message : 'FITS analysis failed.') }
    finally { setBusy(false) }
  }

  async function compare() {
    const firstValidation = validateFits(firstFile)
    const secondValidation = validateFits(secondFile)
    if (firstValidation || secondValidation) return setError(firstValidation || secondValidation)
    if (firstFile!.name === secondFile!.name && firstFile!.size === secondFile!.size) return setError('You selected the same file twice. Choose two observations from different epochs.')
    if (new Date(secondEpoch) <= new Date(firstEpoch)) return setError('The second observation date must be later than the first.')
    setBusy(true); setError(''); setComparison(null); setProgressMessage('Preparing the two FITS observations…')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 180000)
    const progressTimers = [
      window.setTimeout(() => setProgressMessage('Reading FITS image planes and WCS metadata…'), 1200),
      window.setTimeout(() => setProgressMessage('Aligning the second observation onto the first sky grid…'), 4000),
      window.setTimeout(() => setProgressMessage('Estimating background and detecting astronomical sources…'), 9000),
      window.setTimeout(() => setProgressMessage('Matching sources and generating difference images and charts…'), 18000),
    ]
    try {
      const form = new FormData(); form.append('first', firstFile!); form.append('second', secondFile!)
      form.append('first_epoch', firstEpoch); form.append('second_epoch', secondEpoch); form.append('detection_sigma', String(sigma))
      const response = await fetch(`${API}/fits/compare`, { method: 'POST', body: form, signal: controller.signal })
      const data = await readApiResponse(response)
      setComparison(data); setTab('overview'); setSelectedLightCurve(data.matchedSources?.[0]?.firstId ?? '')
      setProgressMessage('Comparison completed successfully.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('The comparison exceeded the 3-minute safety limit. Check the backend terminal for the stage timings and try smaller FITS cutouts (ideally under 20 MB each).')
      else setError(e instanceof Error ? e.message : 'Image comparison failed.')
    } finally {
      window.clearTimeout(timeout); progressTimers.forEach(window.clearTimeout)
      setBusy(false); setProgressMessage('')
    }
  }

  async function downloadReport() {
    const payload = {
      target: 'User-selected sky field', firstEpoch: comparison?.epochs.first, secondEpoch: comparison?.epochs.second,
      deltaDays: comparison?.epochs.deltaDays, firstSourceCount: comparison?.firstSourceCount,
      secondSourceCount: comparison?.secondSourceCount, matchedCount: comparison?.matchedSources.length,
      candidateCount, ra: 'See source FITS WCS', dec: 'See source FITS WCS',
      method: `${comparison?.alignment.method}. ${comparison?.caution}`,
    }
    try {
      const response = await fetch(`${API}/reports/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) { const d = await response.json(); throw new Error(d.detail || 'Could not generate report.') }
      const blob = await response.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'galaxy-divers-screening-report.pdf'; a.click(); URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF report failed.') }
  }

  return <section id={embedded ? 'inline-image-comparison' : 'research-lab'} className={`research-lab ${standalone ? 'research-lab-standalone' : ''} ${embedded ? 'research-lab-embedded' : ''}`}>
    <div className="research-heading">
      <div><span className="eyebrow">{embedded ? 'TWO-EPOCH IMAGE COMPARISON' : 'GALAXY DIVERS · DEDICATED COMPARISON STUDIO'}</span><h2>{embedded ? <>Compare two observations<br/><em>side by side.</em></> : standalone ? <>Compare the sky<br/><em>across time.</em></> : <>From infrared observations<br/><em>to evidence.</em></>}</h2><p>{embedded ? 'Select an earlier and a later SPHEREx-compatible FITS observation. The comparison engine will align the sky fields, generate a difference image and calculate charts from the measured pixels.' : standalone ? "Choose two real SPHEREx FITS observations from different dates. Galaxy Divers aligns both sky fields, shows the two images side by side, creates a difference image and generates measurements and charts." : "Process FITS images, align observation epochs, detect sources and screen for angular motion — with provenance and limitations visible at every step."}</p>{(standalone || embedded) && <div className="compare-page-badges"><span>01 · FIRST EPOCH</span><span>02 · SECOND EPOCH</span><span>03 · DIFFERENCE + ANALYTICS</span></div>}</div>
      <div className="lab-status"><i/> LOCAL ANALYSIS ENGINE <small>Astropy · SciPy · WCS</small></div>
    </div>
    {!embedded && <div className="research-visual-strip">
      <article><img src="/hero/spherex-home-visual.webp" alt="SPHEREx spacecraft and infrared sky visualization"/><span>01 / INFRARED SKY</span></article>
      <article><img src="/hero/solar-system.png" alt="Illustrative solar system visualization"/><span>02 / MOTION CONTEXT</span></article>
      <article><img src="/hero/cosmic-dawn-card.webp" alt="Deep field galaxy visualization"/><span>03 / DEEP UNIVERSE</span></article>
      <article><img src="/hero/water-ice-card.webp" alt="Water ice spectral science illustration"/><span>04 / SPECTRAL SCIENCE</span></article>
    </div>}
    {!embedded && <div className="capability-grid">
      {[
        ['01','NASA SPHEREx archive','Live IRSA SIA2 metadata and original product links'],['02','FITS image processing','Read image planes, metadata, variance and quality extensions'],['03','WCS image alignment','Reproject the second epoch onto the first image sky grid'],['04','Source detection','Sigma-clipped background and local-maximum screening'],['05','Multi-epoch matching','Associate detections by celestial coordinates'],['06','Motion screening','Estimate angular displacement and rate between epochs'],['07','Difference imaging','Generate a background-normalized difference preview'],['08','Interactive sky map','Explore the field and query the archive around its centre'],['09','Trajectory review','Visualize candidate sky positions and displacement'],['10','Candidate dashboard','Inspect IDs, coordinates, SNR and measured separation'],['11','Scientific reporting','Export a PDF screening report with method and caveats'],['12','Reproducibility','Retain epochs, input filenames and processing assumptions'],
      ].map(([n,title,desc]) => <div className="capability-card" key={n}><b>{n}</b><strong>{title}</strong><span>{desc}</span></div>)}
    </div>}

    <div className="analysis-console">
      <div className="console-top"><div><span className="eyebrow">DATA ANALYSIS</span><h3>FITS processing &amp; epoch comparison</h3></div><span className="console-chip">● READY FOR INPUT</span></div>
      <div className="archive-file-help"><span>Need real NASA observations?</span> Search the <a href="/#live-archive">SPHEREx archive</a>, download two compatible FITS products from different dates, then select them below.</div>
      <div className="analysis-tabs"><button className={mode==='compare'?'active':''} onClick={()=>setMode('compare')}>Multi-epoch comparison</button><button className={mode==='single'?'active':''} onClick={()=>setMode('single')}>Single FITS inspection</button></div>
      {mode === 'compare' ? <>
        <div className="epoch-instructions"><b>Compare two dates of the same sky field</b><span>Choose the original FITS observation from each epoch. The app will align the sky coordinates, create a difference image and calculate charts from the uploaded pixel data.</span></div>
        <div className="upload-grid epoch-upload-grid">
          <EpochUploadCard epoch="01" title="FIRST OBSERVATION" subtitle="Earlier date · reference image" file={firstFile} date={firstEpoch} onFile={setFirstFile} onDate={setFirstEpoch} accent="cyan"/>
          <EpochUploadCard epoch="02" title="SECOND OBSERVATION" subtitle="Later date · compared image" file={secondFile} date={secondEpoch} onFile={setSecondFile} onDate={setSecondEpoch} accent="violet"/>
        </div>
        <div className="comparison-readiness"><span className={firstFile ? 'ready' : ''}>01 {firstFile ? 'First FITS selected' : 'Waiting for first FITS'}</span><i>→</i><span className={secondFile ? 'ready' : ''}>02 {secondFile ? 'Second FITS selected' : 'Waiting for second FITS'}</span></div>
      </> : <div className="upload-grid single-upload"><EpochUploadCard epoch="01" title="SINGLE FITS INSPECTION" subtitle="Multi-extension FITS supported" file={singleFile} date={null} onFile={setSingleFile} onDate={()=>{}} accent="cyan"/></div>}
      <div className="analysis-controls"><label>Detection threshold <strong>{sigma}σ</strong><input type="range" min="3" max="10" step="0.5" value={sigma} onChange={e=>setSigma(Number(e.target.value))}/></label><button className="run-analysis" disabled={busy || (mode==='compare' ? !firstFile || !secondFile : !singleFile)} onClick={mode==='compare'?compare:analyzeOne}>{busy?'PROCESSING…':mode==='compare'?'ALIGN · DETECT · COMPARE →':'INSPECT FITS →'}</button></div>
      {busy && <div className="analysis-progress" role="status" aria-live="polite"><span className="progress-spinner"/><div><b>Processing astronomical observations</b><small>{progressMessage || 'Please keep this page open while the backend analyses the images.'}</small></div></div>}
      {!error && mode==='compare' && (!firstFile || !secondFile) && <div className="upload-hint">Select two FITS files above to enable comparison. No sample measurements are used.</div>}
      {error && <div className="workbench-error" role="alert"><b>Could not complete the analysis</b><span>{error}</span></div>}
      {single && <div className="single-result"><div className="result-preview"><img src={single.preview} alt="FITS image preview rendered from uploaded pixels"/></div><div className="result-metrics"><span className="eyebrow">FITS INSPECTION · {single.filename}</span><h4>{single.sourceCount} candidate peaks</h4><div className="metric-grid"><Metric label="Image size" value={`${single.statistics.width} × ${single.statistics.height}`}/><Metric label="WCS" value={single.wcsAvailable?'Available':'Not found'}/><Metric label="Pixel unit" value={String(single.statistics.unit)}/><Metric label="Noise σ" value={single.background.noise?.toPrecision(4) ?? '—'}/></div><p>{single.algorithm}</p></div></div>}
      {comparison && <div className="comparison-results">
        <div className="result-toolbar"><div><span className="eyebrow">COMPARISON COMPLETE</span><h4>Epoch-to-epoch screening</h4></div><button onClick={downloadReport}>↓ Export scientific PDF</button></div>
        <div className="result-metrics-row"><Metric label="Epoch interval" value={`${comparison.epochs.deltaDays.toFixed(1)} days`}/><Metric label="First sources" value={String(comparison.firstSourceCount)}/><Metric label="Second sources" value={String(comparison.secondSourceCount)}/><Metric label="Matched sources" value={String(comparison.matchedSources.length)}/><Metric label="Motion candidates" value={String(candidateCount)}/></div>
        <div className="analysis-tabs result-tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Difference image</button><button className={tab==='sources'?'active':''} onClick={()=>setTab('sources')}>Source matches</button><button className={tab==='motion'?'active':''} onClick={()=>setTab('motion')}>Motion candidates</button><button className={tab==='method'?'active':''} onClick={()=>setTab('method')}>Method &amp; limits</button></div>
        {tab==='overview' && <>
          <div className="epoch-image-grid">
            <figure><figcaption><b>01 · FIRST EPOCH</b><span>{comparison.epochs.first}</span></figcaption><img src={comparison.firstPreview} alt="First FITS epoch preview generated from uploaded data"/></figure>
            <figure><figcaption><b>02 · SECOND EPOCH · ALIGNED</b><span>{comparison.epochs.second}</span></figcaption><img src={comparison.secondAlignedPreview} alt="Second FITS image reprojected onto first epoch WCS"/></figure>
            <figure className="difference-figure"><figcaption><b>03 · ABSOLUTE DIFFERENCE</b><span>Pixel-wise residual preview</span></figcaption><img src={comparison.differencePreview} alt="Absolute difference image generated from aligned FITS epochs"/></figure>
          </div>
          <div className="comparison-chart-grid">
            <article className="chart-card"><div className="chart-heading"><span className="eyebrow">SOURCE COUNTS</span><h5>Detected sources by epoch</h5><p>Counts returned by the same screening threshold.</p></div><EpochCountChart first={comparison.firstSourceCount} second={comparison.secondSourceCount} firstLabel="Epoch 1" secondLabel="Epoch 2"/></article>
            <article className="chart-card"><div className="chart-heading"><span className="eyebrow">MATCH COVERAGE</span><h5>Matched vs unmatched detections</h5><p>Associations are nearest-neighbour positional matches, not confirmed identities.</p></div><MatchDonut matched={comparison.matchSummary.matched} unmatched={comparison.matchSummary.unmatchedFirst + comparison.matchSummary.unmatchedSecond}/></article>
            <article className="chart-card chart-wide"><div className="chart-heading"><span className="eyebrow">SOURCE BRIGHTNESS COMPARISON</span><h5>Two-epoch peak-excess curve</h5><p>Measured peak excess above each image's estimated median background. Native FITS units; not calibrated photometric flux.</p></div>
              {comparison.matchedSources.length ? <>
                <label className="chart-select">Matched source<select value={selectedLightCurve || comparison.matchedSources[0].firstId} onChange={e=>setSelectedLightCurve(e.target.value)}>{comparison.matchedSources.map(m=><option key={m.firstId} value={m.firstId}>{m.firstId} → {m.secondId}</option>)}</select></label>
                <PeakExcessChart source={comparison.matchedSources.find(m=>m.firstId===selectedLightCurve) ?? comparison.matchedSources[0]} firstDate={comparison.epochs.first} secondDate={comparison.epochs.second}/>
              </> : <p className="chart-empty">No positional source matches are available to plot for this pair.</p>}
            </article>
            <article className="chart-card chart-wide"><div className="chart-heading"><span className="eyebrow">RESIDUAL DISTRIBUTION</span><h5>Absolute difference pixel histogram</h5><p>Distribution of absolute pixel residuals in the valid overlapping region.</p></div><DifferenceHistogram bins={comparison.differenceHistogram}/></article>
          </div>
          <div className="flow-card"><div className="chart-heading"><span className="eyebrow">PROCESSING PIPELINE</span><h5>How this comparison was produced</h5><p>Every stage operates on the two FITS files selected above.</p></div><ProcessFlow/></div>
          <div className="difference-view difference-summary"><div><span className="eyebrow">COMPARISON SUMMARY</span><h5>Difference image statistics</h5><p>Second epoch reprojected onto the first image's celestial WCS. A robust median offset is applied for display-level subtraction only.</p><div className="metric-grid"><Metric label="Overlap" value={`${(comparison.alignment.overlapFraction*100).toFixed(1)}%`}/><Metric label="Difference σ" value={comparison.differenceStatistics.std.toPrecision(4)}/><Metric label="Background offset" value={comparison.alignment.backgroundOffsetApplied.toPrecision(4)}/></div></div></div>
        </>}
        {tab==='sources' && <div className="table-wrap"><table><thead><tr><th>First ID</th><th>Second ID</th><th>Separation</th><th>RA (first)</th><th>Dec (first)</th></tr></thead><tbody>{comparison.matchedSources.slice(0,100).map(m=><tr key={`${m.firstId}-${m.secondId}`}><td>{m.firstId}</td><td>{m.secondId}</td><td>{m.separationArcsec.toFixed(3)}″</td><td>{m.firstRa.toFixed(6)}</td><td>{m.firstDec.toFixed(6)}</td></tr>)}</tbody></table>{!comparison.matchedSources.length&&<p>No source associations passed the current 30-arcsec screening radius.</p>}</div>}
        {tab==='motion' && <div className="motion-panel">{plot && <svg className="trajectory-plot" viewBox="0 0 400 220" role="img" aria-label="Sky-coordinate positions of motion-screening candidates"><path d="M30 15V185H385" stroke="#56758e" fill="none"/><text x="35" y="207">RA / Dec field coordinates (relative)</text>{plot.map((p,i)=><g key={i}><line x1={p.px} y1={p.py} x2={p.px+Math.sign(p.dx||1)*15} y2={p.py-Math.sign(p.dy||1)*15} stroke="#5be5e9" strokeWidth="2"/><circle cx={p.px} cy={p.py} r="4" fill="#a4f4ff"/><text x={p.px+7} y={p.py-7} fill="#cdeaf4" fontSize="9">{p.id}</text></g>)}</svg>}<div className="candidate-list">{comparison.motionCandidates.map((m,i)=><article key={i}><span className="eyebrow">SCREENING CANDIDATE {String(i+1).padStart(2,'0')}</span><strong>{m.firstId} → {m.secondId}</strong><p>{m.displacementArcsec.toFixed(3)} arcsec displacement · {m.rateArcsecPerDay.toFixed(4)} arcsec/day</p><small>{m.classification}</small></article>)}{!candidateCount&&<p>No motion-screening candidates were produced from the current pair. This is not evidence that the field contains no moving objects.</p>}</div></div>}
        {tab==='method' && <div className="method-note"><h5>Processing record</h5><p>{comparison.alignment.method}. Reprojection overlap: {(comparison.alignment.overlapFraction*100).toFixed(1)}%. Photometric calibration: not performed.</p><p>{comparison.caution}</p><p>{comparison.provenance}</p></div>}
      </div>}
      <div className="science-disclaimer">SCIENCE NOTE · Automated screening only. Candidate labels are not confirmations. Validate PSF, detector flags, astrometric uncertainties, photometric calibration, epoch metadata and known-object catalogues before interpreting motion.</div>
    </div>
  </section>
}



function EpochUploadCard({epoch,title,subtitle,file,date,onFile,onDate,accent}:{epoch:string;title:string;subtitle:string;file:File|null;date:string|null;onFile:(file:File|null)=>void;onDate:(date:string)=>void;accent:'cyan'|'violet'}) {
  const [dragging,setDragging] = useState(false)
  const inputId = `fits-${epoch}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`
  const acceptFile = (candidate?:File) => {
    if (!candidate) return
    const n=candidate.name.toLowerCase()
    if (!(n.endsWith('.fits')||n.endsWith('.fit')||n.endsWith('.fts')||n.endsWith('.fits.gz')||n.endsWith('.fits.fz'))) return
    onFile(candidate)
  }
  return <div className={`epoch-upload-card ${accent} ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);acceptFile(e.dataTransfer.files?.[0])}}>
    <div className="epoch-card-top"><span className="epoch-number">{epoch}</span><span className="epoch-live-dot">● {file?'FILE READY':'AWAITING FILE'}</span></div>
    <h4>{title}</h4><p>{subtitle}</p>
    <div className="epoch-file-visual"><div className="fits-file-icon">FITS</div><div className="epoch-file-copy"><b>{file?file.name:'Drop a FITS observation here'}</b><small>{file?`${(file.size/1024/1024).toFixed(2)} MB · selected locally`:'or browse your computer · max 120 MB'}</small></div></div>
    <div className="epoch-card-actions"><label className="fits-select-button" htmlFor={inputId}>＋ {file?'Replace FITS file':'Select FITS file'}</label>{file&&<button type="button" className="remove-fits-button" onClick={()=>onFile(null)}>Remove</button>}</div>
    <input id={inputId} className="fits-hidden-input" type="file" accept=".fits,.fit,.fts,.fits.gz,.fits.fz" onChange={e=>acceptFile(e.target.files?.[0])}/>
    {date!==null&&<label className="epoch-date-field">OBSERVATION DATE<input type="date" value={date} onChange={e=>onDate(e.target.value)}/></label>}
    {file&&<div className="selected-file-note">✓ Selected file will be uploaded to the local analysis API when you run comparison.</div>}
  </div>
}

function EpochCountChart({first,second,firstLabel,secondLabel}:{first:number;second:number;firstLabel:string;secondLabel:string}) {
  const max = Math.max(first, second, 1)
  return <div className="epoch-count-chart" role="img" aria-label={`Detected source counts: ${firstLabel} ${first}, ${secondLabel} ${second}`}>
    {[{label:firstLabel,value:first,className:'epoch-one'},{label:secondLabel,value:second,className:'epoch-two'}].map(item=><div className="count-row" key={item.label}><span>{item.label}</span><div className="count-track"><i className={item.className} style={{width:`${Math.max(2,item.value/max*100)}%`}}/></div><b>{item.value}</b></div>)}
    <div className="chart-footnote">Peak detections at the selected σ threshold</div>
  </div>
}

function MatchDonut({matched,unmatched}:{matched:number;unmatched:number}) {
  const total = matched + unmatched
  const pct = total ? matched / total * 100 : 0
  return <div className="donut-wrap"><div className="donut-chart" style={{background:`conic-gradient(#55d7e8 0 ${pct}%, #f0b85b ${pct}% 100%)`}}><div><strong>{total ? `${pct.toFixed(1)}%` : '—'}</strong><small>matched</small></div></div><div className="donut-legend"><span><i className="legend-match"/>Matched detections <b>{matched}</b></span><span><i className="legend-unmatched"/>Unmatched detections <b>{unmatched}</b></span><small>Total detections counted across both epochs: {total}</small></div></div>
}

function PeakExcessChart({source,firstDate,secondDate}:{source:Comparison['matchedSources'][number];firstDate:string;secondDate:string}) {
  const values = [source.firstPeakExcess, source.secondPeakExcess]
  const max = Math.max(...values.map(v=>Math.abs(v)), 1)
  const min = Math.min(0, ...values)
  const range = Math.max(max-min, 1)
  const y = (v:number) => 156 - ((v-min)/range)*116
  const points = values.map((v,i)=>({x:i===0?105:455,y:y(v),v}))
  const delta = source.peakExcessDelta
  return <div className="peak-chart-wrap"><svg className="peak-chart" viewBox="0 0 560 220" role="img" aria-label={`Peak excess for ${source.firstId}: ${source.firstPeakExcess.toPrecision(4)} at first epoch and ${source.secondPeakExcess.toPrecision(4)} at second epoch`}>
    {[0,1,2,3].map(i=><g key={i}><line x1="64" x2="520" y1={36+i*40} y2={36+i*40} stroke="rgba(145,180,205,.18)" strokeDasharray="5 5"/><text x="54" y={40+i*40} textAnchor="end" fill="#7897ad" fontSize="10">{(max-(max-min)*i/3).toPrecision(3)}</text></g>)}
    <line x1="64" x2="520" y1="176" y2="176" stroke="#49647a"/>
    <path d={`M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`} stroke="#65e0e9" strokeWidth="4" fill="none" strokeLinecap="round"/>
    {points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="7" fill="#071522" stroke="#65e0e9" strokeWidth="4"/><text x={p.x} y={Math.max(18,p.y-14)} textAnchor="middle" fill="#e9fbff" fontWeight="700" fontSize="12">{p.v.toPrecision(4)}</text><text x={p.x} y="196" textAnchor="middle" fill="#9bb4c6" fontSize="10">{i===0?firstDate:secondDate}</text></g>)}
  </svg><div className="peak-delta"><span>Peak-excess change</span><strong className={delta>=0?'delta-up':'delta-down'}>{delta>=0?'+':''}{delta.toPrecision(5)}</strong><small>Δ between two observations · source association {source.separationArcsec.toFixed(3)}″</small></div></div>
}

function DifferenceHistogram({bins}:{bins:Comparison['differenceHistogram']}) {
  const max = Math.max(1,...bins.map(b=>b.count))
  return <div className="histogram-wrap"><svg viewBox="0 0 620 220" className="histogram-chart" role="img" aria-label="Histogram of absolute difference pixel residuals">
    {[0,1,2,3].map(i=><line key={i} x1="42" x2="604" y1={20+i*48} y2={20+i*48} stroke="rgba(145,180,205,.15)" strokeDasharray="4 5"/>)}
    {bins.map((b,i)=>{const width=560/Math.max(1,bins.length)-2;const height=b.count/max*170;return <rect key={i} x={44+i*(560/Math.max(1,bins.length))} y={190-height} width={width} height={height} rx="2" fill="#55d7e8" opacity={.45+(b.count/max)*.5}/>})}
    <line x1="42" x2="604" y1="190" y2="190" stroke="#49647a"/><text x="44" y="211" fill="#91aabd" fontSize="10">Lower residual</text><text x="604" y="211" textAnchor="end" fill="#91aabd" fontSize="10">Higher residual</text>
  </svg><div className="chart-footnote">Bars represent pixel counts per residual interval. The y-axis is relative to the largest bin.</div></div>
}

function ProcessFlow() {
  const stages = ['Load two FITS epochs','Read celestial WCS','Reproject to common grid','Estimate background offset','Detect and match sources','Generate residuals & charts']
  return <div className="process-flow">{stages.map((stage,i)=><div className="flow-stage" key={stage}><span>{String(i+1).padStart(2,'0')}</span><b>{stage}</b>{i<stages.length-1&&<i aria-hidden="true">→</i>}</div>)}</div>
}

function Metric({label,value}:{label:string;value:string}) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
