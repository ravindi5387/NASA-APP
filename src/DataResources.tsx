import { useState } from 'react'

type CatalogRow = Record<string, string | null>
type CatalogResult = { catalog: string; service: string; query: {ra:number;dec:number;radiusArcmin:number}; count: number; results: CatalogRow[]; provenance: string; notice: string }

const resources = [
  { group: 'NASA DATA & RESOURCES', title: 'NASA/IPAC Infrared Science Archive', tag: 'PRIMARY MISSION DATA', description: 'Official SPHEREx archive: search spectral-image MEFs and DR1 all-sky cube products, inspect metadata, and retrieve original FITS files through SIA2.', href: 'https://irsa.ipac.caltech.edu/Missions/spherex.html', action: 'Open SPHEREx archive', image: '/hero/spherex-home-visual.webp' },
  { group: 'NASA DATA & RESOURCES', title: 'SPHEREx Tutorial Notebooks', tag: 'PYTHON WORKFLOWS', description: 'Official IRSA notebook examples for SIA2 searches, cloud access, spectral images, cutouts and source discovery workflows.', href: 'https://caltech-ipac.github.io/irsa-tutorials/spherex/', action: 'Explore tutorial notebooks', image: '/hero/water-ice-card.webp' },
  { group: 'NASA DATA & RESOURCES', title: 'WiseView', tag: 'TIME-DOMAIN INSPIRATION', description: 'A public-facing WISE time-domain image viewer. Use it as an inspiration reference for epoch browsing and visual comparison; this link is not presented as a programmatic API.', href: 'http://byw.tools/wiseview', action: 'Open WiseView', image: '/hero/cosmic-dawn-card.webp' },
  { group: 'NASA DATA & RESOURCES', title: 'Gaia Mission Data · DR3', tag: 'ASTROMETRY CATALOGUE', description: 'Gaia DR3 astrometry and photometry can provide external reference positions and proper motions for cross-matching. Galaxy Divers includes a live cone-search connector to the STScI MAST TAP mirror.', href: 'https://archive.stsci.edu/missions-and-data/gaia', action: 'Open Gaia DR3 archive', image: '/hero/solar-system.png' },
  { group: 'SPACE AGENCY PARTNER RESOURCES', title: 'NEOSSat Mission', tag: 'CANADIAN SPACE AGENCY', description: 'Learn how NEOSSat observes asteroids, comets, satellites and other targets. NEOSSat imagery is a complementary partner-mission dataset, not SPHEREx data.', href: 'https://www.asc-csa.gc.ca/eng/satellites/neossat/', action: 'Explore NEOSSat mission', image: '/hero/solar-system.png' },
  { group: 'SPACE AGENCY PARTNER RESOURCES', title: 'Canadian Astronomy Data Centre', tag: 'CADC ARCHIVE', description: 'CADC provides programmatic archive discovery through its TAP service. Galaxy Divers includes a live public ObsCore cone-search attempt for NEOSSat metadata.', href: 'https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/', action: 'Open CADC archive', image: '/hero/cosmic-dawn-card.webp' },
  { group: 'SPACE AGENCY PARTNER RESOURCES', title: 'NEOSSat Data Tutorial', tag: 'PYTHON + FITS', description: 'Canadian Space Agency tutorial repository for learning how to access and visualize NEOSSat observations with Python.', href: 'https://github.com/asc-csa/NEOSSAT_Tutorial', action: 'View NEOSSat tutorial', image: '/hero/water-ice-card.webp' },
  { group: 'SPACE AGENCY PARTNER RESOURCES', title: 'NEOSSat Dataset', tag: 'OPEN GOVERNMENT DATA', description: 'The Canadian open-data record describes the NEOSSat astronomy image dataset and provides links to CADC data resources and the FITS image user guide.', href: 'https://data.asc-csa.gc.ca/dataset/neossat', action: 'Open NEOSSat dataset', image: '/hero/spherex-home-visual.webp' },
]

export function DataResources() {
  const [ra,setRa] = useState('133.795129')
  const [dec,setDec] = useState('-7.245147')
  const [radius,setRadius] = useState('5')
  const [busy,setBusy] = useState<'gaia'|'cadc'|''>('')
  const [error,setError] = useState('')
  const [gaia,setGaia] = useState<CatalogResult|null>(null)
  const [cadc,setCadc] = useState<CatalogResult|null>(null)

  async function queryCatalog(which:'gaia'|'cadc') {
    const r=Number(ra), d=Number(dec), rad=Number(radius)
    if(!Number.isFinite(r)||r<0||r>=360||!Number.isFinite(d)||d < -90||d>90||!Number.isFinite(rad)||rad<=0) { setError('Enter valid decimal-degree coordinates and a positive search radius.'); return }
    setBusy(which); setError('')
    try {
      const path = which==='gaia' ? '/api/catalogs/gaia-dr3/cone' : '/api/catalogs/cadc/neossat'
      const response=await fetch(`${path}?${new URLSearchParams({ra:String(r),dec:String(d),radius_arcmin:String(rad),limit:'100'})}`)
      const body=await response.json()
      if(!response.ok) throw new Error(body.detail || `Catalogue query failed (${response.status})`)
      which==='gaia' ? setGaia(body) : setCadc(body)
    } catch(e) { setError(e instanceof Error ? e.message : 'Catalogue query failed.') }
    finally { setBusy('') }
  }

  return <section id="data-resources" className="data-resources-section">
    <div className="resources-hero"><div><span className="eyebrow">MULTI-AGENCY OPEN ASTRONOMY DATA</span><h2>One research workspace.<br/><em>Multiple mission archives.</em></h2><p>Discover SPHEREx infrared observations, use Gaia DR3 for astrometric context, and explore NEOSSat partner-mission data through CADC. Every result keeps its source and mission identity visible.</p><div className="resource-badges"><span>NASA / IPAC</span><span>ESA Gaia · STScI mirror</span><span>CSA / CADC</span></div></div><img src="/hero/spherex-home-visual.webp" alt="Illustration of SPHEREx spacecraft and infrared sky"/></div>
    <div className="resource-section-heading"><div><span className="eyebrow">01 / OFFICIAL REFERENCE LIBRARY</span><h3>NASA Data &amp; Resources</h3></div><p>Mission archive products and learning resources supplied for this challenge.</p></div>
    <div className="resource-card-grid">{resources.filter(x=>x.group==='NASA DATA & RESOURCES').map(item=><ResourceCard key={item.title} item={item}/>)}</div>
    <div className="resource-section-heading partner-heading"><div><span className="eyebrow">02 / SPACE AGENCY PARTNERS</span><h3>Canadian Space Agency &amp; CADC</h3></div><p>Complementary observations and tutorials. These are separate mission datasets, not SPHEREx products.</p></div>
    <div className="resource-card-grid">{resources.filter(x=>x.group==='SPACE AGENCY PARTNER RESOURCES').map(item=><ResourceCard key={item.title} item={item}/>)}</div>
    <div className="catalog-console"><div className="resource-section-heading"><div><span className="eyebrow">03 / LIVE CATALOGUE CROSS-MATCH</span><h3>Coordinate-based catalogue search</h3></div><span className="console-chip">PUBLIC ARCHIVE SERVICES</span></div>
      <p className="catalog-intro">Search Gaia DR3 astrometry and CADC NEOSSat archive metadata around the same sky position. These connectors query external archive services; availability and coverage depend on each archive.</p>
      <div className="catalog-query-grid"><label>Right Ascension (°)<input value={ra} onChange={e=>setRa(e.target.value)}/></label><label>Declination (°)<input value={dec} onChange={e=>setDec(e.target.value)}/></label><label>Search radius (arcmin)<input value={radius} onChange={e=>setRadius(e.target.value)}/></label></div>
      <div className="catalog-actions"><button disabled={!!busy} onClick={()=>queryCatalog('gaia')}>{busy==='gaia'?'Querying Gaia…':'Search Gaia DR3'}</button><button disabled={!!busy} onClick={()=>queryCatalog('cadc')}>{busy==='cadc'?'Querying CADC…':'Search NEOSSat / CADC'}</button></div>
      {error&&<div className="catalog-error" role="alert">{error}</div>}
      <CatalogPanel result={gaia}/><CatalogPanel result={cadc}/>
    </div>
    <div className="resource-usage-note"><strong>Data-use &amp; endorsement notice</strong><p>NASA does not endorse Galaxy Divers or any non-U.S. Government entity and is not responsible for information on non-U.S. Government websites. Use of each external archive is subject to that provider’s own terms, licences, citation requirements and access policies. Galaxy Divers is an independent educational/research interface.</p></div>
  </section>
}

function ResourceCard({item}:{item:typeof resources[number]}) { return <article className="resource-card"><div className="resource-card-image"><img src={item.image} alt="" loading="lazy"/><span>{item.tag}</span></div><div className="resource-card-body"><small>{item.group}</small><h4>{item.title}</h4><p>{item.description}</p><a href={item.href} target="_blank" rel="noreferrer">{item.action} ↗</a></div></article> }
function CatalogPanel({result}:{result:CatalogResult|null}) { if(!result)return null; const fields=result.catalog.startsWith('Gaia')?['source_id','ra','dec','parallax','pmra','pmdec','phot_g_mean_mag']:['obs_id','obs_collection','instrument_name','target_name','s_ra','s_dec','t_min','t_max']; return <div className="catalog-result"><div className="catalog-result-head"><div><span className="eyebrow">{result.service}</span><h4>{result.catalog}</h4></div><b>{result.count} records</b></div><div className="catalog-table-scroll"><table><thead><tr>{fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{result.results.slice(0,100).map((row,i)=><tr key={i}>{fields.map(f=><td key={f}>{row[f]??'—'}</td>)}</tr>)}</tbody></table>{!result.count&&<p>No records returned for this cone. Try a wider radius or another coordinate.</p>}</div><p className="catalog-provenance">{result.provenance} {result.notice}</p></div> }
