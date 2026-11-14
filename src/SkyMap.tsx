import { useEffect, useRef, useState } from 'react'
import type { Coordinates } from './studio-data'

type Atlas = {
  gotoRaDec: (ra: number, dec: number) => void
  getRaDec: () => [number, number]
  remove?: () => void
}

type AladinApi = typeof import('aladin-lite').default

let loading: Promise<AladinApi> | null = null

function loadAladin(): Promise<AladinApi> {
  if (!loading) {
    // The npm distribution exports the API as an ES module.
    loading = import('aladin-lite')
      .then(async ({ default: api }: { default: AladinApi }) => {
        await api.init
        return api
      })
      .catch(error => {
        loading = null
        throw error
      })
  }
  return loading
}

export function SkyMap({ coords, onSearch }: {
  coords: Coordinates
  onSearch: (coords: Coordinates) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const atlas = useRef<Atlas | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true
    setStatus('loading')
    setErrorMessage('')
    loadAladin().then(api => {
      if (!active || !container.current) return
      const id = 'galaxy-divers-aladin-map'
      container.current.id = id
      atlas.current = api.aladin(`#${id}`, {
        survey: 'P/DSS2/color',
        fov: 0.5,
        cooFrame: 'equatorial',
        showCooGridControl: true,
        showSimbadPointerControl: true,
        showCooGrid: true,
      })
      setStatus('ready')
    }).catch(error => {
      if (active) {
        setErrorMessage(error instanceof Error ? error.message : 'Unknown Aladin Lite loading error.')
        setStatus('error')
      }
    })
    return () => {
      active = false
      atlas.current?.remove?.()
      atlas.current = null
    }
  }, [attempt])

  const { ra, dec } = coords
  useEffect(() => {
    if (status === 'ready') atlas.current?.gotoRaDec(ra, dec)
  }, [status, ra, dec])

  return <section className="panel sky-map" aria-labelledby="sky-map-title">
    <div className="viewer-head"><h2 id="sky-map-title">Aladin Lite sky map</h2></div>
    <p>Interactive DSS2 colour sky survey from CDS. Pan and zoom, then search the live SPHEREx archive around the map centre. This optical survey is a reference layer, not SPHEREx infrared data.</p>
    <div ref={container} className="aladin-map" hidden={status === 'error'} aria-label="Interactive sky map" />
    {status === 'loading' && <p role="status">Loading Aladin Lite…</p>}
    {status === 'error' && <div className="archive-error" role="alert">
      <strong>Sky map could not be loaded</strong>
      <span>{errorMessage}</span>
      <small>Check your internet connection and make sure your browser supports WebGL 2, then retry.</small>
      <button onClick={() => {
        container.current?.replaceChildren()
        setStatus('loading')
        setAttempt(value => value + 1)
      }}>Retry sky map</button>
      <a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">Open Aladin Lite directly ↗</a>
    </div>}
    {status === 'ready' && <div className="sky-map-actions">
      <button onClick={() => {
        const center = atlas.current?.getRaDec()
        if (!center?.every(Number.isFinite)) return
        onSearch({ ra: ((center[0] % 360) + 360) % 360, dec: center[1] })
      }}>Search map center</button>
      <button onClick={() => atlas.current?.gotoRaDec(ra, dec)}>Return to target</button>
    </div>}
    <p><a href="https://aladin.cds.unistra.fr/AladinLite/" target="_blank" rel="noreferrer">Open Aladin Lite at CDS ↗</a></p>
  </section>
}
