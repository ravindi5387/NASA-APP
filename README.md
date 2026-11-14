# Galaxy Divers — SPHEREx Research Workbench

A React + TypeScript + Vite frontend and FastAPI/Astropy backend for exploring public SPHEREx archive products and running transparent, reproducible FITS screening workflows.

## What's included in this build

### 1. NASA SPHEREx archive integration
- Live NASA/IPAC IRSA SIA2 search by ICRS RA/Dec, cone radius and collection.
- Current searchable collections: `spherex_dr1`, `spherex_dr1_deep`, `spherex_dr1_cube`, `spherex_qr3`, `spherex_qr3_deep`.
- Download proxy for original IRSA products with an HTTPS host allow-list and 120 MB per-file cap.
- CSV export and original archive provenance.

### 2. FITS processing
- Upload a FITS image / SPHEREx multi-extension FITS (MEF).
- Reads the first available 2D image plane and checks for `VARIANCE` and `FLAGS` extensions.
- Displays image dimensions, unit, observation header values, finite-pixel statistics, and a stretched PNG preview.
- Does not silently treat an uploaded file as a verified NASA archive product.

### 3. WCS alignment and difference imaging
- Upload two FITS images and provide their observation dates.
- Uses celestial WCS and `reproject_interp` to resample the second image onto the first image's WCS grid.
- Reports valid overlap and applies a robust median background offset before subtraction.
- Produces an absolute difference preview and difference-image screening peaks.
- Explicitly reports that this operation is not photometric calibration or PSF matching.

### 4. Source detection and multi-epoch screening
- Sigma-clipped background/noise estimate.
- Local-maximum detections above a configurable background + N-sigma threshold.
- Converts pixel positions to RA/Dec when valid celestial WCS exists.
- Nearest-neighbour sky-coordinate association between epochs and an angular displacement/rate screening list.
- Candidate dashboard, source-match table, and a simple relative trajectory plot.

### 5. Scientific reports
- PDF screening report with input names, epochs, source counts, alignment method, and limitations.
- CSV archive metadata export.

### 6. Visual experience
- Existing SPHEREx-specific homepage and mission cards retained.
- New Science Workbench section with four existing astronomy/mission artwork panels and 12 capability cards.
- Existing Aladin Lite interactive sky map remains in the Explore page (CDS DSS2 optical reference layer, not SPHEREx infrared data).

## Windows setup (Python 3.14 or 3.13)

Open the `galaxy-divers` folder in VS Code.

### Terminal 1 — backend

Recommended: double-click `start-backend.bat` from the project root. Or run:

```powershell
cd D:\appNASA\galaxy-divers
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If Python 3.14 is not installed, replace `-3.14` with `-3.13`. Check installed versions with `py --list`. Keep this terminal open.

### Terminal 2 — frontend

```powershell
cd D:\appNASA\galaxy-divers
npm ci
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). Keep both terminals open.

### API checks
- Health: `http://127.0.0.1:8000/api/health`
- Interactive API docs: `http://127.0.0.1:8000/docs`

## How to use the Science Workbench

1. In Explore, search IRSA around the target coordinates.
2. Expand a result and choose **Download original FITS for analysis**. The download proxy accepts only the official IRSA HTTPS hostnames.
3. Open **Science Lab** and choose **Single FITS inspection** to inspect one file.
4. For two observations of the same field, choose **Multi-epoch comparison**, upload both FITS files, enter the actual observation dates, then run **Align · Detect · Compare**.
5. Inspect the difference image, source matches, and motion-screening candidates.
6. Export a PDF screening report.

## Scientific limitations — read before interpreting results

This project is a research-screening workbench, not the official SPHEREx science pipeline.

- The archive endpoint returns live IRSA metadata and product URLs. Archive coverage depends on position, release, and ingestion status.
- The FITS analyzer selects the first available 2D image plane. It reports the presence of variance/flag extensions but does not yet propagate variance or interpret all SPHEREx flag bits.
- WCS reprojection aligns celestial grids, but the current comparison does not perform PSF homogenization, full photometric calibration, distortion validation, detector artifact masking, or uncertainty propagation.
- Source detections are thresholded local maxima. They are not a validated SPHEREx source catalogue and are not guaranteed to be astrophysical objects.
- Cross-epoch nearest-neighbour associations are screening suggestions. The motion list must be reviewed for false associations, blends, artifacts, WCS systematics, and known solar-system objects. It is not a Planet Nine detector.
- The relative trajectory plot is a visualization of computed coordinate pairs, not a physical orbit fit.
- The DR1 All-Sky Cube is a distinct FITS cube product with 102 nominal channels. The archive selector does not fabricate 102 measured spectra; full cube-plane spectral extraction is not included in this release.
- The PDF is a screening report, not a publication-ready scientific validation report.
- Demo data, CSS artwork, and mission cards are clearly separate from live archive products and FITS-derived measurements.

## Official data references

- SPHEREx DR1 overview: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html
- SPHEREx archive data access and SIA2 collections: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/
- SPHEREx data product / FITS structure: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/
- IRSA SPHEREx mission tools: https://irsa.ipac.caltech.edu/Missions/spherex.html

## Build verification

Run `npm ci` then `npm run build` on the target Windows machine. Run `python -m compileall backend` to check Python syntax. A successful `/api/health` check confirms the local API is running; a successful live IRSA query and successful FITS workflow are separate end-to-end tests.


## Multi-agency astronomy data resources (added)

The Data Resources section links the official SPHEREx IRSA archive and tutorial notebooks, WiseView as a user-facing WISE time-domain reference (not an API), Gaia DR3 reference data, and Canadian Space Agency / CADC NEOSSat resources.

### Live catalogue connectors

- `GET /api/catalogs/gaia-dr3/cone?ra=...&dec=...&radius_arcmin=...&limit=...` queries the public STScI MAST Gaia DR3 TAP mirror. Returned astrometry is an external catalogue cross-match, not an automatic source identification.
- `GET /api/catalogs/cadc/neossat?ra=...&dec=...&radius_arcmin=...&limit=...` submits a public CADC ObsCore TAP query filtered for NEOSSat metadata. CADC query results depend on archive metadata coverage; data-product downloads can require authentication.

The user interface keeps NASA/SPHEREx products distinct from Gaia catalogue rows and NEOSSat/CADC partner-mission records. External services can be temporarily unavailable or rate-limited. Use the source archive links and comply with each provider's data-use/licensing requirements. NASA does not endorse Galaxy Divers.

## Two-epoch image comparison analytics (v7 update)

The Science Workbench comparison view now presents analytics computed from the two uploaded FITS files:

- First-epoch preview, second-epoch WCS-aligned preview, and absolute-difference preview.
- Detected-source count comparison for both epochs.
- Donut chart of positional matches versus unmatched detections.
- Selectable two-epoch peak-excess curve for a matched source. Values are peak pixel excess above each image's sigma-clipped median background, in the native FITS image units; they are **not** calibrated aperture photometry or a validated light curve.
- Histogram of absolute pixel residuals in the valid overlap region.
- A processing flow diagram describing the actual comparison stages.

The comparison endpoint returns source peak excess/SNR values and a residual histogram calculated from the input images. The backend reprojects the second image to the first image's celestial WCS before calculating residuals. A median background offset is applied for display-level subtraction only; photometric calibration and PSF matching are not performed.

### Important scientific interpretation

Two images provide two epochs only. A four-epoch light curve requires four actual observation products for the same target/pixel or a defined source aperture; the application must not fill missing epochs with invented or demo values. The current chart therefore plots two measured points only. Positional matching is a screening heuristic and candidate labels are not confirmed moving objects.


## Dedicated image comparison page (v8)

Open `http://localhost:5173/compare` or select **Compare Images** in the navigation. This is a separate full-page workspace; it is not embedded in the homepage. Upload two compatible FITS observations, provide their observation dates, then run the backend comparison to produce aligned previews, a difference image, source-count chart, match-coverage donut, two-epoch peak-excess chart, residual histogram, source table and motion-screening view.

The plots are computed from the selected FITS files. They are not pre-filled with illustrative measurements. The two-epoch peak-excess plot is not a calibrated multi-epoch photometric light curve. Use at least four actual epochs and a validated photometry pipeline for a scientific light curve.

## Dedicated Compare Images page (v9 update)

Open `http://localhost:5173/compare`. The page requires **two separate real FITS observations**. Select an earlier FITS file in First Observation and a later FITS file in Second Observation, then set their observation dates and click **ALIGN · DETECT · COMPARE**. You can also drag and drop a FITS file onto either observation card. The comparison button stays disabled until both files are selected.

To obtain inputs, open the SPHEREx archive search from the home page (`/#explorer`), search a sky position, and download two compatible image FITS products from different observation dates. Return to `/compare` and select those downloaded files. The backend accepts FITS files up to 120 MB each and requires both files to contain valid celestial WCS with overlapping sky coverage. A 102-channel all-sky cube is not automatically equivalent to a single 2-D image plane; choose compatible spectral-image products for this two-image comparison workflow.

After successful processing, the page displays the first epoch, the second epoch reprojected onto the first epoch's WCS, and an absolute-difference preview. It also displays source counts, a match-coverage donut, a two-epoch peak-excess plot, a residual histogram, source matches and screening candidates. Peak excess is in native FITS units and is not calibrated photometry. This screening workflow is not a validated SPHEREx pipeline or a confirmed moving-object/Planet Nine detector.

If the compare button is disabled, one or both files have not been selected. If the API reports an error, keep the FastAPI terminal running on port 8000 and read the detailed error returned by the backend; the frontend now handles non-JSON responses without a JSON parsing crash.

## Inline comparison workspace update

The old collapsed `Upload observations` drawer has been removed from the SPHEREx Blink & Shift Studio section. It is replaced in the same position by the inline two-epoch comparison workspace (`ResearchWorkbench embedded`). Users select an earlier FITS observation and a later FITS observation in separate cards, set their dates, and run the existing backend alignment, source-detection, matching, difference-image and chart workflow. The dedicated `/compare` route remains available and continues to use the same analysis component.

The comparison requires two compatible FITS files with valid overlapping celestial WCS. Selecting dates alone does not create real observations; use the NASA/IPAC archive links to obtain the actual FITS products.

### Challenge target selector update (v11)
All five challenge targets are selectable. Each selection opens an explicitly labelled **SIMULATED PREVIEW · NOT NASA DATA** so users can explore the interface even when no prepared local time-series exists. Use **Find observations** to search the live NASA/IPAC IRSA archive at the selected target coordinates; actual archive coverage and released products are not guaranteed. Target coordinates are J2000/ICRS lookups from SIMBAD for Epsilon Indi B and R Draconis; Barnard's Star and RW Aurigae retain the project's existing SIMBAD-resolved coordinates. WISE 0855 uses the challenge coordinates 08h55m10.831s, −07°14′42.53″.


## FITS comparison performance (v12)
- The comparison endpoint runs in FastAPI's worker threadpool so CPU-heavy processing does not block other API requests.
- Background/noise estimation uses a bounded robust sample; peak finding remains on the native pixel grid.
- The frontend shows processing stages and stops waiting after 3 minutes with a useful message.
- For quick testing, use two calibrated, overlapping cutouts from the same sky region and same SPHEREx band, preferably 5–20 MB each. Large full-frame products may take longer.
- The backend logs FITS-read, source-screening and total comparison durations.
