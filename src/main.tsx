import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import { ObservationStudio, Studio } from './Studio'
import { SkyMap } from './SkyMap'
import { SkyGuide } from './SkyGuide'
import { ObservationUpload, saveObservation, type UploadedObservation } from './ObservationUpload'
import { demoCube, parseCoordinates } from './studio-data'
import { LiveSpherexArchive } from './LiveSpherexArchive'
import { AwardModules } from './AwardModules'
import { ResearchWorkbench } from './ResearchWorkbench'
import { DataResources } from './DataResources'

type Frame = { image: string; observedAt: string; wavelength: string; source: string }
type Sequence = { target: string; ra: number; dec: number; frames: Frame[]; cube?: string }

const targets = ['Barnard’s Star', 'Epsilon Indi B', 'WISE 0855', 'RW Aurigae', 'R Draconis']
// J2000/ICRS target coordinates resolved from SIMBAD. Archive coverage must still be checked live.
const demo = { ra: 133.795129, dec: -7.245147 }
const query = new URLSearchParams(location.search)

const presets = [
  { target: 'WISE 0855', ...parseCoordinates('08h55m10.831s', '-07d14m42.53s')! },
  { target: 'Barnard’s Star', ...parseCoordinates('17h57m48.498s', '+4d41m36.114s')! },
  { target: 'Epsilon Indi B', ...parseCoordinates('22h04m10.595s', '-56d46m58.239s')! },
  { target: 'RW Aurigae', ...parseCoordinates('05h07m49.566s', '+30d24m05.177s')! },
  { target: 'R Draconis', ...parseCoordinates('16h32m40.227s', '+66d45m17.926s')! },
]

function App() {
  const [upload, setUpload] = useState<UploadedObservation | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [ra, setRa] = useState(query.get('ra') ?? String(demo.ra))
  const [dec, setDec] = useState(query.get('dec') ?? String(demo.dec))
  const [position, setPosition] = useState(() => parseCoordinates(query.get('ra') ?? '', query.get('dec') ?? ''))
  const [demoTarget, setDemoTarget] = useState(() => presets.find(item => item.target === query.get('demo'))?.target ?? (query.has('ra') || query.has('dec') ? '' : presets[0].target))
  const [zoom, setZoom] = useState(() => /^[1-5]$/.test(query.get('zoom') ?? '') ? Number(query.get('zoom')) : 1)
  const [viewKey, setViewKey] = useState(0)
  const demoData = useMemo(() => demoTarget ? demoCube(demoTarget) : null, [demoTarget])
  const demoPreset = presets.find(item => item.target === demoTarget) ?? presets[0]
  const [error, setError] = useState('')
  const [archiveSearchKey, setArchiveSearchKey] = useState(0)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const sequence = position && sequences.find((item) =>
    Math.abs(item.ra - position.ra) < 0.000001 && Math.abs(item.dec - position.dec) < 0.000001)
  const frames = sequence ? [...sequence.frames].sort((a, b) =>
    Date.parse(a.observedAt) - Date.parse(b.observedAt)) : []
  const count = frames.length
  const current = frames[frame]

  useEffect(() => {
    if (query.has('ra') || query.has('dec') || location.hash === '#explorer') {
      document.getElementById('explorer')?.scrollIntoView({ behavior: 'instant' })
    }
    fetch('/data/manifest.json')
      .then((response) => {
        if (!response.ok) throw new Error('Manifest unavailable')
        return response.json() as Promise<{ sequences: Sequence[] }>
      })
      .then(({ sequences }) => {
        if (!Array.isArray(sequences)) throw new Error('Invalid manifest')
        setSequences(sequences)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [])

  useEffect(() => {
    if (!playing || count < 2) return
    const timer = window.setInterval(() => setFrame((index) => (index + 1) % count), 650)
    return () => window.clearInterval(timer)
  }, [playing, count])

  function select(coords: typeof demo, target = '', mode?: 'blink' | 'difference') {
    setUpload(null)
    setDemoTarget(target)
    setViewKey(value => value + 1)
    setPosition(coords)
    setFrame(0)
    setPlaying(false)
    setError('')
    const url = new URL(location.href)
    url.search = new URLSearchParams({
      ra: String(coords.ra), dec: String(coords.dec), zoom: String(zoom), ...(target ? { demo: target } : {}),
    }).toString()
    if (mode) url.searchParams.set('mode', mode)
    url.hash = 'explorer'
    setRa(String(coords.ra))
    setDec(String(coords.dec))
    history.replaceState(null, '', url)
  }

  function changeZoom(value: number) {
    setZoom(value)
    if (upload) return
    const url = new URL(location.href)
    url.searchParams.set('zoom', String(value))
    history.replaceState(null, '', url)

  }

  return <>
    <header className="site-header">
      <a className="brand" href="#home">
        <span className="galaxy-mark" aria-hidden="true" />
        <span className="brand-copy"><strong>Galaxy Divers</strong><small>Dive into · Discover · Explore</small></span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="nav-home" href="/">Home</a>
        <a href="/#explorer">Explore</a>
        <a href="/#spherex">SPHEREx</a>
        <a href="/#planet-x">Planet X</a>
        <a href="/compare" aria-current={location.pathname === '/compare' ? 'page' : undefined}>Compare Images</a>
        <a href="/#research-lab">Science Lab</a>
        <a href="/#data-resources">Data Resources</a>
        <a href="/#tools">Tools</a>
        <a href="/#about">About</a>
      </nav>
      <form className="header-search" onSubmit={event => { event.preventDefault(); document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' }) }}>
        <span aria-hidden="true">⌕</span><input aria-label="Search planets and missions" placeholder="Search sky, object, or coordinate..." />
      </form>
      <a className="header-icon" href="#missions" aria-label="Notifications">♧</a>
      <a className="header-avatar" href="#community" aria-label="Account">●</a>
    </header>
    <main id="home">{location.pathname === '/compare' ? <ResearchWorkbench standalone /> : <>
      <section className="home-landing" aria-labelledby="hero-title">
        <div className="home-hero spherex-hero">
          <div className="home-hero-copy">
            <p className="home-kicker">NASA <b>•</b> SPHEREx <b>•</b> 102 COLORS <b>•</b> PLANET NINE</p>
            <h1 id="hero-title">Dive into the<br/>Unseen <span>Sky.</span></h1>
            <div className="hero-statement"><strong>102 Colors.</strong> 4 Visits. One Whole Universe.</div>
            <p className="home-lead">NASA’s SPHEREx surveys the entire sky in 102 infrared spectral channels. Galaxy Divers brings released observations into one workspace to explore wavelength differences, compare observation epochs, and investigate candidate objects.</p>
            <p className="detector-note">6 detectors = 102 colors.</p>
            <div className="home-actions">
              <a className="home-primary" href="#explorer"><span>▶</span> Start Exploring</a>
              <a className="home-secondary" href="#spherex"><span>♧</span> Learn about SPHEREx</a>
            </div>
          </div>
          <img className="spectral-sky-art" src="/hero/spherex-home-visual.webp" alt="SPHEREx spacecraft observing a colorful infrared map of the sky above Earth" />
          <div className="home-stats spherex-stats" aria-label="SPHEREx mission facts">
            <div><span className="stat-icon">▱</span><strong>102</strong><small>Infrared Colors</small></div>
            <div><span className="stat-icon">✺</span><strong>450M+</strong><small>Galaxies targeted</small></div>
            <div><span className="stat-icon">▦</span><strong>4</strong><small>All-sky surveys<br/>over 2 years</small></div>
          </div>
        </div>
        <div className="home-shortcuts spherex-shortcuts" id="discover">
          <a href="#explorer"><span className="shortcut-icon">▱</span><span><strong>Explore 102 Colors</strong><small>Explore released observations across infrared wavelengths.</small></span><b>›</b></a>
          <a href="/compare"><span className="shortcut-icon">♧</span><span><strong>Compare Images</strong><small>Align two observation epochs and inspect differences, sources and charts.</small></span><b>›</b></a>
          <a href="#bands"><span className="shortcut-icon">⌁</span><span><strong>Pixel Tools</strong><small>Spectrum = What is it? Light curve = Is it moving?</small></span><b>›</b></a>
          <a href="#explorer"><span className="shortcut-icon">⌯</span><span><strong>Share Discovery</strong><small>Share a coordinate link with ?ra=&amp;dec= and embed anywhere.</small></span><b>›</b></a>
        </div>
        <section className="featured-missions spherex-featured" id="missions">
          <div className="section-heading"><h2>Featured SPHEREx Missions</h2><a href="#explorer">View All Missions <span>→</span></a></div>
          <div className="mission-feature-grid">
            <article className="mission-feature planet-nine">
              <div className="mission-image"><span className="mini-orbit">✦</span></div>
              <div className="mission-copy"><span className="mission-state ongoing">● Ongoing</span><h3>Planet Nine Hunt</h3><p>Search for moving-object candidates using time-series comparisons and image subtraction.</p><div className="mission-progress"><span>Challenge target analysis</span><b><i style={{width:'72%'}}/></b></div></div><a className="mission-open" href="#explorer" aria-label="Explore Planet Nine Hunt">→</a>
            </article>
            <article className="mission-feature water-ice">
              <div className="mission-image"><span className="water-spectrum">3.0 μm<br/><small>H₂O ice</small></span></div>
              <div className="mission-copy"><span className="mission-state upcoming">● Research focus</span><h3>Water Ice Hunt</h3><p>Inspect spectral features near 3.0 μm and investigate water-ice signatures.</p><div className="mission-progress"><span>Pixel spectrum workspace</span></div></div><a className="mission-open" href="#tools" aria-label="Explore Water Ice Hunt">→</a>
            </article>
            <article className="mission-feature cosmic-dawn">
              <div className="mission-image"></div><div className="mission-copy"><span className="mission-state planned">● Science goal</span><h3>Cosmic Dawn</h3><p>Explore galaxy populations and the science of the early universe.</p><div className="mission-progress"><span>Deep universe exploration</span></div></div><a className="mission-open" href="#explorer" aria-label="Explore Cosmic Dawn">→</a>
            </article>
          </div>
        </section>
      </section>
      <section id="spherex" className="home-info-strip"><div><span className="info-kicker">THE MISSION</span><h2>One sky. 102 infrared colors.</h2><p>SPHEREx observes the whole sky in near-infrared wavelengths. Galaxy Divers is designed to help explore released observations, compare epochs, and inspect spectral information.</p></div><a href="#explorer">Open SPHEREx Explorer →</a></section>
      <div id="community" className="community-anchor" aria-label="Galaxy Divers community"><span>GALAXY DIVERS · SPHEREx EXPLORATION HUB</span><a href="#explorer">Start exploring →</a></div>
      <section id="explorer" className="explorer" aria-labelledby="explorer-title">
      <h2 id="explorer-title">SPHEREx Blink &amp; Shift Studio</h2>
      <p className="intro">Compare the same patch of infrared sky across observations.</p>
      <ResearchWorkbench embedded />
      <div className="layout">
        <aside className="panel">
          <h2>Sky coordinates</h2>
          <form onSubmit={(event) => {
            event.preventDefault()
            const coords = parseCoordinates(ra, dec)
            if (!coords) {
              setError('Enter decimal degrees or coordinates like 08h55m and −7d14m.')
              return
            }
            select(coords)
            setArchiveSearchKey(value => value + 1)
            requestAnimationFrame(() => document.getElementById('live-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
          }}>
            <label>Right ascension (°)<input value={ra} onChange={(e) => setRa(e.target.value)} /></label>
            <label>Declination (°)<input value={dec} onChange={(e) => setDec(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit">Find observations</button>
          </form>
          <h2 className="targets">Challenge targets</h2>
          <label className="target-select">Quick-select target
            <select value={demoTarget || sequence?.target || ''} onChange={event => {
              const target = event.currentTarget.value
              const preset = presets.find(item => item.target === target)
              if (!preset) {
                setError('Please choose one of the five supported challenge targets.')
                return
              }
              // Always open the target's local educational preview immediately.
              // Archive coverage is checked separately; it must not disable target selection.
              select(preset, target)
              requestAnimationFrame(() => document.getElementById('observation-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
            }}>
              <option value="">Choose a target</option>
              {targets.map(target => <option key={target} value={target}>
                {target} · preview available
              </option>)}
            </select>
          </label>
        </aside>
        <section id="observation-viewer" className="panel viewer" aria-label="Observation viewer">
          <div className="viewer-head">
            <h2>{upload?.target || demoTarget || (sequence ? sequence.target : 'Observation search')}</h2>
            {upload && <button onClick={() => saveObservation(upload)}>Save observation JSON</button>}
            {demoTarget && <span className="badge" title="Illustrative preview only; not a NASA observation">SIMULATED PREVIEW · NOT NASA DATA</span>}
            {!upload && !demoTarget && !sequence && <button onClick={() => select(presets[0], presets[0].target)}>Open demo</button>}
          </div>
          {upload ? <Studio key={viewKey} cube={upload.cube} target={upload.target} coords={upload.coords} zoom={zoom} onZoom={changeZoom} local />
            : demoData ? <Studio key={viewKey} cube={demoData} target={demoTarget} coords={demoPreset} zoom={zoom} onZoom={changeZoom} simulated />
            : sequence && sequence.cube ? <ObservationStudio key={viewKey} url={sequence.cube} target={sequence.target} coords={sequence} zoom={zoom} onZoom={changeZoom} />
            : <>
          <div className="sky">
            {current
              ? <img src={current.image} alt={`SPHEREx observation of ${sequence?.target ?? 'selected sky field'}`} />
              : <p role="status">{loadState === 'loading' ? 'Loading observations…'
                : loadState === 'error' ? 'Could not load the observation catalog. Reload to retry.'
                : 'No prepared local time-series at these coordinates. Use the live NASA SPHEREx archive search below to find released products.'}</p>}
          </div>
          {count > 0 && <div className="playback">
            <button disabled={count < 2} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" aria-label="Observation frame" min="0" max={count - 1} value={frame}
              disabled={count < 2} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)) }} />
            <span>Frame {frame + 1} / {count}</span>
          </div>}
          <div className="details">
            {current && <><span>{current.observedAt} · {current.wavelength}</span>
                <a href={current.source}>Observation source</a></>}
          </div>
          </>}
        </section>
        <MissionSidebar />
      </div>
      <SkyMap coords={position ?? demoPreset} onSearch={coords => select(coords)} />
      <div id="live-archive"><LiveSpherexArchive ra={position?.ra ?? demoPreset.ra} dec={position?.dec ?? demoPreset.dec} searchKey={archiveSearchKey} /></div>
      </section>
      <section id="tools" className="content-page-section tools-page-section">
        <div className="section-heading"><h2>Research Tools</h2><span>DATA WORKSPACE</span></div>
        <p>Use the tools below to inspect observations, compare compatible FITS images, and record candidate findings. Tools only display measured science values when a real archive product or compatible FITS file is loaded.</p>
        <div className="page-feature-grid">
          <a href="#explorer"><b>01 · Observation Search</b><span>Search NASA/IPAC IRSA by right ascension, declination and radius.</span></a>
          <a href="#live-archive"><b>02 · FITS Archive Products</b><span>Review returned observation dates, wavelength coverage and product links.</span></a>
          <a href="#explorer"><b>03 · FITS Comparison Studio</b><span>Load compatible FITS-derived cubes for blink, wipe and difference inspection.</span></a>
          <a href="#research-modules"><b>04 · Research Notebook</b><span>Record candidate notes and export research metadata.</span></a>
        </div>
      </section>
      <DataResources />
      <section id="planet-x" className="content-page-section planet-x-page-section">
        <div className="section-heading"><h2>Planet X Investigation</h2><span>HYPOTHESIS · NOT A CONFIRMED DISCOVERY</span></div>
        <p>Planet Nine remains a hypothesis. Galaxy Divers helps investigate the broader search problem by examining time-separated observations and candidate motion. A moving source must be checked against observation times, image alignment, artifacts, known solar-system objects and external catalogues before it can be classified.</p>
        <div className="planet-x-callout"><strong>What counts as evidence?</strong><span>Repeated detections at consistent epochs, a statistically significant displacement, reliable astrometry, quality-flag checks, and independent confirmation. A bright pixel or a single image is not evidence of Planet Nine.</span></div>
        <a className="home-primary" href="#explorer">Open observation workspace →</a>
      </section>
      <section id="about" className="content-page-section about-page-section">
        <div className="section-heading"><h2>About Galaxy Divers</h2><span>NASA SPACE APPS CHALLENGE</span></div>
        <p>Galaxy Divers is a research and learning interface for exploring public SPHEREx observations. Archive results are sourced from NASA/IPAC Infrared Science Archive (IRSA). The application distinguishes real archive metadata, processed measurements, simulated examples and unverified candidate notes.</p>
        <div className="page-feature-grid"><div><b>Open science</b><span>Use public archive products and retain source links and observation metadata.</span></div><div><b>Scientific integrity</b><span>Never label simulated examples as NASA observations or candidates as confirmed planets.</span></div><div><b>Reproducibility</b><span>Record coordinates, release, product IDs, observation epochs and processing assumptions.</span></div></div>
      </section>
      <div id="research-modules"></div>
      <AwardModules />
      <section className="mission-notes" aria-label="About the project">
        <div><h2>Planet X</h2><p>Planet X is a hypothetical planet beyond Neptune. The red planet in the hero is an illustration.</p></div>
        <div><h2>About Galaxy Divers</h2><p>We’re building an infrared sky explorer for the NASA International Space Apps Challenge.</p></div>
      </section>
    </>}
    </main>
  </>
}


function MissionSidebar() {
  const [fov, setFov] = useState('0.5° × 0.5°')
  const [zoomLevel, setZoomLevel] = useState(45)
  const [gaia, setGaia] = useState(true)
  const [wise, setWise] = useState(true)
  const [cosmic, setCosmic] = useState(false)
  const [zodiacal, setZodiacal] = useState(true)
  const [bright, setBright] = useState(true)
  const [band, setBand] = useState(51)
  return <aside className="mission-sidebar" aria-label="Mission visualization controls">
    <section className="mission-card">
      <div className="mission-card-title"><span>FIELD OF VIEW</span><span className="live-dot">●</span></div>
      <label>FOV<select value={fov} onChange={e => setFov(e.target.value)}>
        <option>0.25° × 0.25°</option><option>0.5° × 0.5°</option><option>1° × 1°</option><option>2° × 2°</option><option>5° × 5°</option>
      </select></label>
      <label>Zoom · {zoomLevel}%<input type="range" min="10" max="100" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))}/></label>
    </section>
    <section className="mission-card">
      <div className="mission-card-title">CATALOG OVERLAYS</div>
      <ToggleRow label="Gaia DR3" detail="Optical astrometry" checked={gaia} onChange={setGaia}/>
      <ToggleRow label="WISE" detail="Infrared sources" checked={wise} onChange={setWise}/>
      <p className="mission-hint">Overlay controls are display preferences. Catalog matches are shown only when catalogue data is available.</p>
    </section>
    <section className="mission-card">
      <div className="mission-card-title">DATA QUALITY FLAGS</div>
      <ToggleRow label="Cosmic ray" detail="Mask flagged pixels" checked={cosmic} onChange={setCosmic}/>
      <ToggleRow label="Zodiacal light" detail="Background model" checked={zodiacal} onChange={setZodiacal}/>
      <ToggleRow label="Bright-star mask" detail="Mask saturated regions" checked={bright} onChange={setBright}/>
    </section>
    <section className="mission-card bands-card">
      <div className="mission-card-title">SPECTRAL CHANNEL EXPLORER</div>
      <div className="band-gradient"></div>
      <div className="band-labels"><span>0.75 μm</span><span>2.5 μm</span><span>5.0 μm</span></div>
      <label>Selected channel · {band} / 102<input type="range" min="1" max="102" value={band} onChange={e => setBand(Number(e.target.value))}/></label>
      <div className="band-status">102 CHANNELS · CHANNEL SELECTOR PREVIEW</div>
      <p className="mission-hint">The selected channel is a UI control. Real spectral values require a compatible released FITS product.</p>
    </section>
    <section className="mission-card spectrum-card">
      <div className="mission-card-title">SPECTRUM WORKSPACE</div>
      <svg viewBox="0 0 300 100" role="img" aria-label="Illustrative spectrum placeholder">
        <path d="M10 82 H290 M10 12 V82" stroke="currentColor" opacity=".35" fill="none"/>
        <path d="M10 78 C28 77 32 68 43 70 S61 43 74 55 S93 63 105 42 S128 56 142 35 S163 50 177 30 S198 54 211 39 S234 48 248 26 S270 43 290 20" fill="none" stroke="#79e5e5" strokeWidth="2.5"/>
        <path d="M10 78 C28 77 32 68 43 70 S61 43 74 55 S93 63 105 42 S128 56 142 35 S163 50 177 30 S198 54 211 39 S234 48 248 26 S270 43 290 20 L290 82 L10 82Z" fill="#54c9d2" opacity=".12"/>
      </svg>
      <small>Illustrative preview · not measured SPHEREx flux</small>
    </section>
  </aside>
}
function ToggleRow({ label, detail, checked, onChange }: {label:string; detail:string; checked:boolean; onChange:(value:boolean)=>void}) {
  return <div className="toggle-row"><span><strong>{label}</strong><small>{detail}</small></span><button type="button" className={`switch ${checked ? 'is-on' : ''}`} aria-pressed={checked} onClick={() => onChange(!checked)}><i/></button></div>
}

createRoot(document.getElementById('root')!).render(<App />)
