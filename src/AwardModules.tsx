import { useState, type FormEvent } from 'react'

const targets = [
  ["Barnard's Star","High proper-motion star","17h 57m 48.498s","+04° 41′ 36.114″","Compare astrometric positions across epochs and distinguish real motion from registration offsets."],
  ["Epsilon Indi B","Brown dwarf system","Catalogue lookup required","Catalogue lookup required","Inspect available infrared observations and verify archive coverage and component resolution."],
  ["WISE 0855","Very cool brown dwarf","08h 55m 10.831s","−07° 14′ 42.53″","Search archive coverage, compare suitable epochs, and inspect position and measurement uncertainty."],
  ["RW Aurigae","Young variable stellar system","Catalogue lookup required","Catalogue lookup required","Compare calibrated flux measurements over time and check observation conditions."],
  ["R Draconis","Variable star","16h 32m 40.227s","+66° 45′ 17.926″","Look for repeat observations and build a light curve from verified flux measurements."],
] as const

function saveJson(name:string, data:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}))
  const a=document.createElement("a"); a.href=url; a.download=name; a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function AwardModules() {
  const [selected,setSelected]=useState(2)
  const [channel,setChannel]=useState(51)
  const [candidate,setCandidate]=useState({name:"",ra:"",dec:"",notes:""})
  const [items,setItems]=useState<typeof candidate[]>([])
  const [quiz,setQuiz]=useState("")
  const [checked,setChecked]=useState(false)
  const [researchNotes,setResearchNotes]=useState("")
  const t=targets[selected]
  return <div className="award-modules">
    <section className="award-section" id="target-library">
      <div className="award-heading"><div><span className="award-eyebrow">CHALLENGE TARGET CATALOG</span><h2>Explore Five Cosmic Targets</h2><p>Preloaded investigation targets. Coordinates are reference positions; verify epoch, proper motion and live archive coverage before analysis.</p></div><span className="award-index">01 / TARGETS</span></div>
      <div className="target-layout"><div className="target-grid">{targets.map((x,i)=><button key={x[0]} className={`target-tile ${selected===i?"selected":""}`} onClick={()=>setSelected(i)}><span className="target-number">0{i+1}</span><strong>{x[0]}</strong><small>{x[1]}</small><b>↗</b></button>)}</div>
      <article className="target-detail"><span className="award-eyebrow">SELECTED INVESTIGATION</span><h3>{t[0]}</h3><p>{t[1]}</p><dl><div><dt>Right Ascension</dt><dd>{t[2]}</dd></div><div><dt>Declination</dt><dd>{t[3]}</dd></div></dl><h4>Suggested investigation</h4><p>{t[4]}</p><a className="award-button" href="#explorer">Open Sky Explorer →</a><small className="science-note">Coordinates are reference values; verify against a trusted catalogue and the selected data epoch.</small></article></div>
    </section>

    <section className="award-section" id="bands">
      <div className="award-heading"><div><span className="award-eyebrow">SPECTRAL WORKSPACE</span><h2>102-Channel Explorer</h2><p>Choose a channel for navigation. Measured spectra require a compatible calibrated SPHEREx FITS product.</p></div><span className="award-index">02 / SPECTRA</span></div>
      <div className="bands-workspace"><div className="band-control"><span className="award-eyebrow">SELECTED CHANNEL</span><div className="band-number">{String(channel).padStart(2,"0")} <small>/ 102</small></div><input type="range" min="1" max="102" value={channel} onChange={e=>setChannel(+e.target.value)}/><div className="band-groups"><button onClick={()=>setChannel(18)}>Short<small>01–34</small></button><button onClick={()=>setChannel(51)}>Mid<small>35–68</small></button><button onClick={()=>setChannel(85)}>Long<small>69–102</small></button></div><p className="science-note">Channel index is not a wavelength calibration. Read wavelength mapping from the FITS product metadata.</p></div><div className="spectrum-placeholder"><div className="spectrum-title"><strong>Spectral measurement</strong><span>AWAITING MEASURED FITS DATA</span></div><div className="spectrum-graphic"><svg viewBox="0 0 600 160" preserveAspectRatio="none"><path d="M0 140H600M0 10V140" stroke="#42627d" fill="none"/><text x="300" y="82" fill="#9bb8d1" textAnchor="middle" fontSize="16">Load calibrated spectral data to plot flux</text></svg></div><a className="award-button secondary" href="#explorer">Load observations in Explorer →</a></div></div>
    </section>

    <section className="award-section" id="discoveries"><div className="award-heading"><div><span className="award-eyebrow">CITIZEN SCIENCE</span><h2>Candidate Discovery Desk</h2><p>Record interesting points for follow-up. Submissions are unverified candidates, not confirmed discoveries.</p></div><span className="award-index">03 / DISCOVER</span></div>
      <div className="discovery-layout"><form className="candidate-form" onSubmit={(e:FormEvent)=>{e.preventDefault();setItems(v=>[...v,candidate]);setCandidate({name:"",ra:"",dec:"",notes:""})}}>
        <label>Candidate label<input required value={candidate.name} onChange={e=>setCandidate({...candidate,name:e.target.value})} placeholder="Candidate A-01"/></label><div className="candidate-coords"><label>RA<input required value={candidate.ra} onChange={e=>setCandidate({...candidate,ra:e.target.value})} placeholder="133.795129"/></label><label>Dec<input required value={candidate.dec} onChange={e=>setCandidate({...candidate,dec:e.target.value})} placeholder="-7.245147"/></label></div><label>Research notes<textarea rows={4} value={candidate.notes} onChange={e=>setCandidate({...candidate,notes:e.target.value})} placeholder="Products, epochs compared, evidence and limitations…"/></label><button className="award-button">＋ Save candidate locally</button><small className="science-note">Stored only in this browser session; no server account is connected.</small></form>
      <div className="candidate-list"><div className="candidate-list-head"><strong>My candidate list</strong><span>{items.length} recorded</span></div>{items.length===0?<div className="empty-candidate"><strong>No candidates recorded yet</strong><small>Add a candidate after reviewing real observations.</small></div>:items.map((x,i)=><article className="candidate-row" key={i}><div><strong>{x.name}</strong><small>RA {x.ra} · Dec {x.dec}</small><small>{x.notes||"No notes"}</small></div><span>UNVERIFIED</span></article>)}</div></div>
    </section>

    <section className="award-section" id="learn"><div className="award-heading"><div><span className="award-eyebrow">LEARNING CENTER</span><h2>Test Your Space Science</h2><p>Learn why careful image processing matters for time-domain astronomy.</p></div><span className="award-index">04 / LEARN</span></div>
      <div className="learning-card"><div><span className="learning-symbol">✦</span><h3>Quick science check</h3><p>Why must two astronomical images be aligned before calculating a difference image?</p></div><div className="quiz-options">{["To make images more colourful","So the same sky positions map to the same pixels","To increase the number of spectral channels"].map(x=><button className={quiz===x?"chosen":""} key={x} onClick={()=>{setQuiz(x);setChecked(false)}}>{x}</button>)}<button className="award-button" disabled={!quiz} onClick={()=>setChecked(true)}>Check answer</button>{checked&&<p className={quiz.startsWith("So the same")?"quiz-correct":"quiz-wrong"}>{quiz.startsWith("So the same")?"Correct. Registration makes pixel-by-pixel comparison meaningful.":"Not quite. Aligning images ensures that corresponding pixels represent the same sky locations."}</p>}</div></div>
    </section>

    <section className="award-section" id="research"><div className="award-heading"><div><span className="award-eyebrow">RESEARCH OUTPUT</span><h2>Investigation Report</h2><p>Export your target selection, channel, research notes and candidate list.</p></div><span className="award-index">05 / REPORT</span></div>
      <div className="report-bar"><div><strong>{t[0]}</strong><small>Selected target · Channel {channel} · {items.length} candidate(s)</small></div><button className="award-button" onClick={()=>saveJson("galaxy-divers-research-notes.json",{generatedAt:new Date().toISOString(),target:{name:t[0],category:t[1],ra:t[2],dec:t[3]},selectedChannel:channel,notes:researchNotes,candidates:items,notice:"Research notes only. Add verified archive product identifiers, measured values, uncertainties, processing details and citations before treating results as scientific findings."})}>↓ Export research JSON</button></div>
      <label className="research-notes-label">Investigator notes<textarea rows={3} value={researchNotes} onChange={e=>setResearchNotes(e.target.value)} placeholder="Record your hypothesis, archive product IDs, observations, processing steps and limitations…"/></label><p className="science-note">The export is a structured research-notes file, not a validated scientific report or measured-data result.</p>
    </section>
  </div>
}
