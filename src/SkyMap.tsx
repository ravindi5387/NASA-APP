import { useEffect, useRef, useState } from 'react'
import type { Coordinates } from './studio-data'

type Atlas = {
  gotoRaDec: (ra: number, dec: number) => void
  getRaDec: () => [number, number]
  remove?: () => void
}

type AladinApi = {
  init: Promise<void>
  aladin: (selector: string, options: {
    survey: string
    fov: number
    cooFrame: string
    showCooGridControl: boolean
    showSimbadPointerControl?: boolean
    showCooGrid?: boolean
  }) => Atlas
}

declare global {
  interface Window { A?: AladinApi }
}

let loading: Promise<AladinApi> | null = null

const ALADIN_SOURCES = [
  // Pinned npm distribution is a CDN mirror of the official CDS Aladin Lite.
  'https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.min.js',
  'https://aladin.cds.unistra.fr/AladinLite/api/v3/3.8.2/aladin.js',
]

function ensureAladinStyles() {
  if (document.querySelector('link[data-aladin-css="true"]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.min.css'
  link.dataset.aladinCss = 'true'
  document.head.appendChild(link)
}

function loadAladin(): Promise<AladinApi> {
  if (window.A) return Promise.resolve(window.A)
  if (!loading) {
    loading = (async () => {
      ensureAladinStyles()
      const errors: string[] = []
      for (const src of ALADIN_SOURCES) {
        try {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            const timer = window.setTimeout(() => {
              script.remove()
              reject(new Error(`Timed out loading ${src}`))
            }, 20000)
            script.src = src
            script.async = true
            script.crossOrigin = 'anonymous'
            script.onload = () => { window.clearTimeout(timer); resolve() }
            script.onerror = () => {
              window.clearTimeout(timer)
              script.remove()
              reject(new Error(`Could not load ${src}`))
            }
            document.head.appendChild(script)
          })
          const api = window.A
          if (!api) throw new Error('Aladin Lite script loaded but did not expose window.A')
          await api.init
          return api
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      throw new Error(`Could not load Aladin Lite from either the jsDelivr mirror or official CDS host. ${errors.join(' | ')}`)
    })().catch(error => {
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
      // Aladin Lite v3 examples use the container selector and global A API.
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
      atlas.current.gotoRaDec(coords.ra, coords.dec)
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
    // Recreate only when the user explicitly retries; coordinates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const { ra, dec } = coords
  useEffect(() => {
    if (status === 'ready') atlas.current?.gotoRaDec(ra, dec)
  }, [status, ra, dec])

  return <section className="panel sky-map" aria-labelledby="sky-map-title">
    <div className="viewer-head"><h2 id="sky-map-title">Aladin Lite sky map</h2></div>
    <p>Interactive DSS2 colour sky survey from CDS. Pan and zoom, then search the live SPHEREx archive around the map centre. This optical survey is a reference layer, not SPHEREx infrared data.</p>
    <div ref={container} className="aladin-map" hidden={status === 'error'} aria-label="Interactive sky map" />
    {status === 'loading' && <p role="status">Loading Aladin Lite from the official CDS service…</p>}
    {status === 'error' && <div className="archive-error" role="alert">
      <strong>Sky map could not be loaded</strong>
      <span>{errorMessage}</span>
      <small>Check internet access to aladin.cds.unistra.fr, then retry. The rest of the website can still be used.</small>
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
