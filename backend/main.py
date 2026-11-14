from __future__ import annotations

import base64
import csv
import io
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import httpx
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.time import Time
from astropy.utils.data import conf
from astropy.wcs import WCS
from astroquery.ipac.irsa import Irsa
from scipy.ndimage import maximum_filter

conf.remote_timeout = 120
logger = logging.getLogger("galaxy_divers.spherex")

app = FastAPI(
    title="Galaxy Divers · SPHEREx Research API",
    description="NASA/IPAC IRSA archive access and reproducible FITS analysis tools.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

COLLECTIONS = {
    "DR1 All-Sky": ("spherex_dr1", "spectral-image MEF"),
    "DR1 Deep": ("spherex_dr1_deep", "spectral-image MEF"),
    "DR1 102-Channel All-Sky Cube": ("spherex_dr1_cube", "all-sky spectral cube"),
    "QR3 Wide": ("spherex_qr3", "spectral-image MEF"),
    "QR3 Deep": ("spherex_qr3_deep", "spectral-image MEF"),
}
MAX_FITS_BYTES = 120 * 1024 * 1024


@app.exception_handler(Exception)
async def unhandled_api_error(request: Request, exc: Exception):
    logger.exception("Unhandled API error %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {str(exc)[:350]}"})


def clean(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if hasattr(value, "item"):
            value = value.item()
    except Exception:
        pass
    value = str(value).strip()
    return None if value.lower() in {"", "none", "nan", "--", "masked"} else value


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Galaxy Divers SPHEREx API", "archive": "NASA/IPAC IRSA SIA2", "analysis": ["FITS statistics", "WCS", "source detection", "image reprojection", "epoch matching"]}


@app.get("/api/spherex/search")
def search_spherex(
    ra: float = Query(..., ge=0, lt=360),
    dec: float = Query(..., ge=-90, le=90),
    radius_arcmin: float = Query(2.0, gt=0, le=60),
    release: str = Query("DR1 All-Sky"),
    limit: int = Query(100, ge=1, le=500),
):
    selected = COLLECTIONS.get(release)
    if not selected:
        raise HTTPException(status_code=400, detail=f"Unknown release '{release}'.")
    collection, product_kind = selected
    try:
        logger.info("IRSA SIA2: %s ra=%s dec=%s radius=%s arcmin", collection, ra, dec, radius_arcmin)
        table = Irsa.query_sia(
            pos=(ra, dec, radius_arcmin / 60.0), collection=collection,
            maxrec=limit, data_type="cube" if collection == "spherex_dr1_cube" else "image",
        )
        results = []
        for row in table:
            item = {str(name).lower(): clean(row[name]) for name in table.colnames}
            url = item.get("access_url")
            if not url or not url.startswith(("https://irsa.ipac.caltech.edu/", "https://irsawebops2.ipac.caltech.edu/")):
                continue
            results.append({
                "id": item.get("obs_id") or item.get("obs_publisher_did") or f"record-{len(results)+1}",
                "observationStart": item.get("t_min"), "observationEnd": item.get("t_max"),
                "target": item.get("target_name"), "instrument": item.get("instrument_name"),
                "collection": item.get("collection") or collection, "ra": item.get("s_ra"), "dec": item.get("s_dec"),
                "wavelengthMin": item.get("em_min"), "wavelengthMax": item.get("em_max"),
                "accessUrl": url, "cloudAccess": item.get("cloud_access"),
                "dataProductType": item.get("dataproduct_type"), "calibrationLevel": item.get("calib_level"),
            })
        results.sort(key=lambda r: r["observationStart"] or "")
        return {
            "query": {"ra": ra, "dec": dec, "radiusArcmin": radius_arcmin, "release": release, "collection": collection},
            "count": len(results), "results": results, "productKind": product_kind,
            "provenance": "NASA/IPAC Infrared Science Archive (IRSA), SPHEREx SIA2",
            "archiveUrl": "https://irsa.ipac.caltech.edu/SIA?",
            "notice": "Archive metadata and original product links are live IRSA results. A zero-result cone does not prove that a target was never observed.",
        }
    except Exception as exc:
        logger.exception("IRSA SIA2 query failed for %s", collection)
        raise HTTPException(status_code=502, detail=f"IRSA SIA2 request failed: {type(exc).__name__}: {str(exc)[:450]}") from exc



@app.get("/api/catalogs/gaia-dr3/cone")
async def search_gaia_dr3(
    ra: float = Query(..., ge=0, lt=360),
    dec: float = Query(..., ge=-90, le=90),
    radius_arcmin: float = Query(2.0, gt=0, le=30),
    limit: int = Query(100, ge=1, le=500),
):
    """Query public Gaia DR3 astrometry from the STScI MAST TAP service."""
    radius_deg = radius_arcmin / 60.0
    adql = (
        "SELECT TOP {limit} source_id, ra, dec, parallax, pmra, pmdec, "
        "phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source "
        "WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), "
        "CIRCLE('ICRS', {ra}, {dec}, {radius})) "
        "ORDER BY phot_g_mean_mag ASC"
    ).format(limit=limit, ra=ra, dec=dec, radius=radius_deg)
    endpoint = "https://mast.stsci.edu/vo-tap/api/v0.1/gaiadr3/sync"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
            response = await client.post(endpoint, data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
        response.raise_for_status()
        text = response.text.lstrip("\ufeff")
        if not text or text.lstrip().startswith("<"):
            raise ValueError("MAST returned a non-CSV response.")
        rows = list(csv.DictReader(io.StringIO(text)))
        return {
            "catalog": "Gaia DR3", "service": "STScI MAST TAP",
            "query": {"ra": ra, "dec": dec, "radiusArcmin": radius_arcmin},
            "count": len(rows), "results": rows,
            "provenance": "Gaia Data Release 3 via the Space Telescope Science Institute MAST TAP service.",
            "notice": "Gaia is an external astrometric catalogue. Cross-matches are positional associations, not proof of object identity or motion."
        }
    except Exception as exc:
        logger.exception("Gaia DR3 TAP query failed")
        raise HTTPException(status_code=502, detail=f"Gaia DR3 TAP query failed: {type(exc).__name__}: {str(exc)[:300]}") from exc


@app.get("/api/catalogs/cadc/neossat")
async def search_cadc_neossat(
    ra: float = Query(..., ge=0, lt=360),
    dec: float = Query(..., ge=-90, le=90),
    radius_arcmin: float = Query(10.0, gt=0, le=120),
    limit: int = Query(100, ge=1, le=300),
):
    """Search public CADC ObsCore metadata near a sky coordinate for NEOSSat records."""
    radius_deg = radius_arcmin / 60.0
    adql = (
        "SELECT TOP {limit} obs_id, obs_collection, instrument_name, facility_name, "
        "target_name, s_ra, s_dec, t_min, t_max, dataproduct_type, calib_level, access_url "
        "FROM ivoa.ObsCore WHERE INTERSECTS(s_region, "
        "CIRCLE('ICRS', {ra}, {dec}, {radius})) = 1 "
        "AND (obs_collection LIKE '%NEOSSat%' OR instrument_name LIKE '%NEOSSat%' "
        "OR facility_name LIKE '%NEOSSat%')"
    ).format(limit=limit, ra=ra, dec=dec, radius=radius_deg)
    endpoint = "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
            response = await client.post(endpoint, data={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql})
        response.raise_for_status()
        text = response.text.lstrip("\ufeff")
        if not text or text.lstrip().startswith("<"):
            raise ValueError("CADC returned a non-CSV response.")
        rows = list(csv.DictReader(io.StringIO(text)))
        return {
            "catalog": "NEOSSat / CADC ObsCore", "service": "Canadian Astronomy Data Centre TAP",
            "query": {"ra": ra, "dec": dec, "radiusArcmin": radius_arcmin},
            "count": len(rows), "results": rows,
            "provenance": "Canadian Astronomy Data Centre (CADC) ObsCore TAP metadata service.",
            "notice": "A zero-result cone search does not imply no NEOSSat observations exist elsewhere. CADC product downloads may require authentication depending on access rights."
        }
    except Exception as exc:
        logger.exception("CADC NEOSSat TAP query failed")
        raise HTTPException(status_code=502, detail=f"CADC NEOSSat TAP query failed: {type(exc).__name__}: {str(exc)[:300]}") from exc


def read_fits_image(data: bytes):
    try:
        hdul = fits.open(io.BytesIO(data), memmap=False, ignore_missing_simple=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read FITS file: {exc}") from exc
    with hdul:
        image_hdu = None
        for hdu in hdul:
            arr = getattr(hdu, "data", None)
            if isinstance(arr, np.ndarray) and arr.ndim >= 2 and arr.size:
                image_hdu = hdu
                break
        if image_hdu is None:
            raise HTTPException(status_code=400, detail="No 2D image plane was found in this FITS file.")
        data2d = np.asarray(image_hdu.data, dtype=np.float32)
        while data2d.ndim > 2:
            data2d = data2d[0]
        header = image_hdu.header.copy()
        if not header.get("CTYPE1") and hdul[0].header.get("CTYPE1"):
            header.extend(hdul[0].header, update=True)
        variance = None
        flags = None
        for hdu in hdul:
            name = str(hdu.name).upper()
            if name == "VARIANCE" and isinstance(hdu.data, np.ndarray):
                variance = np.asarray(hdu.data, dtype=np.float32)
                while variance.ndim > 2: variance = variance[0]
            elif name == "FLAGS" and isinstance(hdu.data, np.ndarray):
                flags = np.asarray(hdu.data)
                while flags.ndim > 2: flags = flags[0]
        return data2d, header, variance, flags


def make_preview(array: np.ndarray, max_side: int = 900) -> str:
    from PIL import Image
    valid = np.isfinite(array)
    if not valid.any():
        raise HTTPException(status_code=400, detail="FITS image contains no finite pixels.")
    vals = array[valid]
    lo, hi = np.nanpercentile(vals, [1, 99.5])
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        hi = lo + 1
    scaled = np.clip((array - lo) / (hi - lo), 0, 1)
    scaled[~valid] = 0
    h, w = scaled.shape
    step = max(1, int(np.ceil(max(h, w) / max_side)))
    pixels = (scaled[::step, ::step] * 255).astype(np.uint8)
    image = Image.fromarray(pixels, mode="L").convert("RGB")
    out = io.BytesIO(); image.save(out, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("ascii")


def detect_sources(array: np.ndarray, wcs: WCS | None, sigma: float = 5.0, max_sources: int = 150):
    """Fast screening detector: robust stats on a bounded sample, then local maxima.

    The sample bounds background-estimation cost for full-frame SPHEREx images while
    the peak search still runs on the native image grid. This is a screening method,
    not a replacement for PSF-aware Photutils source extraction.
    """
    finite = np.isfinite(array)
    finite_count = int(finite.sum())
    if finite_count < 100:
        return [], {"background": None, "noise": None, "threshold": None}
    values = array[finite]
    stride = max(1, int(np.ceil(values.size / 250_000)))
    sample = values[::stride]
    median = float(np.median(sample))
    mad = float(np.median(np.abs(sample - median)))
    std = 1.4826 * mad
    if not np.isfinite(std) or std <= 0:
        # Fallback for quantized/low-noise frames; still computed on bounded sample.
        std = float(np.std(sample))
    if not np.isfinite(std) or std <= 0:
        return [], {"background": median, "noise": 0.0, "threshold": None}
    threshold = float(median + sigma * std)
    work = np.where(finite, array, -np.inf)
    peaks = (work == maximum_filter(work, size=7, mode="nearest")) & (work > threshold)
    ys, xs = np.where(peaks)
    if len(xs):
        order = np.argpartition(array[ys, xs], -min(max_sources, len(xs)))[-min(max_sources, len(xs)):]
        xs, ys = xs[order], ys[order]
        order = np.argsort(array[ys, xs])[::-1]
        xs, ys = xs[order], ys[order]
    sources = []
    if wcs is not None and wcs.has_celestial and len(xs):
        try:
            sky = wcs.pixel_to_world(xs.astype(float), ys.astype(float))
            ras, decs = sky.ra.deg, sky.dec.deg
        except Exception:
            ras = decs = [None] * len(xs)
    else:
        ras = decs = [None] * len(xs)
    for idx, (x, y, ra, dec) in enumerate(zip(xs, ys, ras, decs), start=1):
        peak = float(array[y, x])
        sources.append({"id": f"SRC-{idx:03d}", "x": float(x), "y": float(y), "peak": peak,
                        "approxFlux": peak - median, "snr": (peak - median) / std,
                        "ra": float(ra) if ra is not None else None,
                        "dec": float(dec) if dec is not None else None})
    return sources, {"background": median, "noise": float(std), "threshold": threshold}


@app.get("/api/spherex/download")
async def download_spherex_product(url: str = Query(..., min_length=20, max_length=2000)):
    """Safely proxy an original public IRSA FITS product for local analysis."""
    parsed = urlparse(url)
    allowed_hosts = {"irsa.ipac.caltech.edu", "irsawebops2.ipac.caltech.edu"}
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts or not parsed.path.startswith("/"):
        raise HTTPException(status_code=400, detail="Only HTTPS product URLs hosted by the official IRSA domains are accepted.")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0), follow_redirects=False) as client:
            response = await client.get(url)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"IRSA product server returned HTTP {response.status_code}.")
        if len(response.content) > MAX_FITS_BYTES:
            raise HTTPException(status_code=413, detail="This product exceeds the 120 MB download limit for the web workbench.")
        filename = parsed.path.rsplit("/", 1)[-1] or "spherex-product.fits"
        media = "application/fits"
        return StreamingResponse(io.BytesIO(response.content), media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"', "Content-Length": str(len(response.content))})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("IRSA product download failed")
        raise HTTPException(status_code=502, detail=f"Could not retrieve the IRSA product: {type(exc).__name__}: {str(exc)[:250]}") from exc


@app.post("/api/fits/analyze")
async def analyze_fits(file: UploadFile = File(...), sigma: float = Form(5.0)):
    raw = await file.read(MAX_FITS_BYTES + 1)
    if len(raw) > MAX_FITS_BYTES:
        raise HTTPException(status_code=413, detail="FITS upload exceeds 120 MB limit.")
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded FITS file is empty.")
    arr, header, variance, flags = read_fits_image(raw)
    valid = np.isfinite(arr)
    if flags is not None and flags.shape == arr.shape:
        # Do not assume all nonzero SPHEREx flag bits are fatal; report flags separately.
        flagged_fraction = float(np.count_nonzero(flags) / flags.size)
    else:
        flagged_fraction = None
    try:
        wcs = WCS(header).celestial
        if not wcs.has_celestial: wcs = None
    except Exception:
        wcs = None
    sources, background = detect_sources(arr, wcs, sigma=float(np.clip(sigma, 3, 10)))
    finite_vals = arr[valid]
    stats = {
        "width": int(arr.shape[1]), "height": int(arr.shape[0]), "finitePixels": int(valid.sum()),
        "min": float(np.nanmin(finite_vals)), "max": float(np.nanmax(finite_vals)),
        "mean": float(np.nanmean(finite_vals)), "median": float(np.nanmedian(finite_vals)),
        "std": float(np.nanstd(finite_vals)), "unit": header.get("BUNIT", "header unit not specified"),
        "observationDate": header.get("DATE-OBS") or header.get("MJD-OBS"),
        "object": header.get("OBJECT"), "detector": header.get("DETECTOR") or header.get("DET_ID"),
        "band": header.get("BAND"), "flaggedPixelFraction": flagged_fraction,
        "varianceExtension": variance is not None,
    }
    return {
        "filename": file.filename, "statistics": stats, "background": background,
        "wcsAvailable": wcs is not None, "sources": sources, "sourceCount": len(sources),
        "preview": make_preview(arr),
        "provenance": "User-uploaded FITS file. Measurements are computed from the supplied pixels; archive provenance is not inferred from the filename.",
        "algorithm": "Sigma-clipped background/noise estimate; local maxima above background + sigma × noise. This is a screening catalogue, not a validated SPHEREx pipeline product.",
    }


@app.post("/api/fits/compare")
def compare_fits(
    first: UploadFile = File(...), second: UploadFile = File(...),
    first_epoch: str = Form(...), second_epoch: str = Form(...),
    detection_sigma: float = Form(5.0),
):
    # A synchronous FastAPI route runs in its worker threadpool. CPU-heavy FITS
    # reprojection/detection therefore does not block the event loop or health API.
    started = time.perf_counter()
    a_bytes = first.file.read(MAX_FITS_BYTES + 1); b_bytes = second.file.read(MAX_FITS_BYTES + 1)
    if len(a_bytes) > MAX_FITS_BYTES or len(b_bytes) > MAX_FITS_BYTES:
        raise HTTPException(status_code=413, detail="Each FITS file must be 120 MB or smaller.")
    stage = time.perf_counter()
    a, ha, va, fa = read_fits_image(a_bytes); b, hb, vb, fb = read_fits_image(b_bytes)
    logger.info("FITS pair read in %.2fs; shapes=%s,%s; bytes=%s,%s", time.perf_counter()-stage, a.shape, b.shape, len(a_bytes), len(b_bytes))
    try:
        wa, wb = WCS(ha).celestial, WCS(hb).celestial
        if not wa.has_celestial or not wb.has_celestial:
            raise ValueError("Celestial WCS is missing")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Both FITS files need valid celestial WCS for sky alignment: {exc}") from exc
    try:
        from reproject import reproject_interp
        align_started = time.perf_counter()
        b_aligned, footprint = reproject_interp((b, wb), wa, shape_out=a.shape, order="bilinear")
        logger.info("WCS alignment completed in %.2fs", time.perf_counter()-align_started)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"WCS reprojection failed: {type(exc).__name__}: {str(exc)[:300]}") from exc
    valid = np.isfinite(a) & np.isfinite(b_aligned) & (footprint > 0.5)
    if valid.sum() < 100:
        raise HTTPException(status_code=422, detail="The two images have too little overlapping valid sky area.")
    # Robustly match median backgrounds before subtracting. This is a display/analysis
    # normalization, not photometric calibration.
    offset = float(np.nanmedian(a[valid]) - np.nanmedian(b_aligned[valid]))
    b_norm = b_aligned + offset
    diff = np.full(a.shape, np.nan, dtype=np.float32)
    diff[valid] = a[valid] - b_norm[valid]
    stage = time.perf_counter()
    sigma_value = float(np.clip(detection_sigma, 3, 10))
    diff_sources, bg = detect_sources(np.abs(diff), wa, sigma=sigma_value, max_sources=100)
    src_a, _ = detect_sources(a, wa, sigma=sigma_value, max_sources=150)
    src_b, _ = detect_sources(b_aligned, wa, sigma=sigma_value, max_sources=150)
    logger.info("Source screening completed in %.2fs; detections=%d,%d", time.perf_counter()-stage, len(src_a), len(src_b))
    # Match nearest detections in angular coordinates. Report only matches within 5 arcsec.
    matched = []
    a_sky = [SkyCoord(s["ra"] * u.deg, s["dec"] * u.deg) for s in src_a if s.get("ra") is not None]
    b_sky = [SkyCoord(s["ra"] * u.deg, s["dec"] * u.deg) for s in src_b if s.get("ra") is not None]
    a_valid_sources = [s for s in src_a if s.get("ra") is not None]
    b_valid_sources = [s for s in src_b if s.get("ra") is not None]
    if a_sky and b_sky:
        c1 = SkyCoord([s.ra for s in a_sky], [s.dec for s in a_sky])
        c2 = SkyCoord([s.ra for s in b_sky], [s.dec for s in b_sky])
        # One vectorized catalogue match instead of a Python loop of KD-tree queries.
        indices, separations, _ = c1.match_to_catalog_sky(c2)
        for source, idx, sep in zip(a_valid_sources, indices, separations):
            if sep.arcsec <= 30:
                other = b_valid_sources[int(idx)]
                matched.append({
                    "firstId": source["id"], "secondId": other["id"],
                    "separationArcsec": float(sep.arcsec),
                    "firstRa": source["ra"], "firstDec": source["dec"],
                    "secondRa": other["ra"], "secondDec": other["dec"],
                    "firstPeakExcess": float(source["approxFlux"]),
                    "secondPeakExcess": float(other["approxFlux"]),
                    "firstSNR": float(source["snr"]), "secondSNR": float(other["snr"]),
                    "peakExcessDelta": float(other["approxFlux"] - source["approxFlux"]),
                })
    try:
        t1, t2 = Time(first_epoch), Time(second_epoch)
        delta_days = float((t2 - t1).to_value(u.day))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Epoch must be an ISO date/time, for example 2026-01-15: {exc}") from exc
    if delta_days <= 0:
        raise HTTPException(status_code=400, detail="Second epoch must be later than first epoch.")
    moving = []
    for m in matched:
        c1 = SkyCoord(m["firstRa"] * u.deg, m["firstDec"] * u.deg)
        c2 = SkyCoord(m["secondRa"] * u.deg, m["secondDec"] * u.deg)
        # A nearest-neighbour pair within 5 arcsec is a stationary-source match,
        # so motion screening is performed on unmatched detections below.
        motion = float(c1.separation(c2).arcsec)
        if motion > 0.5:
            moving.append({**m, "displacementArcsec": motion, "rateArcsecPerDay": motion / delta_days, "classification": "motion-screening candidate; requires validation"})
    diff_preview = make_preview(np.abs(diff))
    first_preview = make_preview(a)
    second_preview = make_preview(b_norm)
    hist_values = np.abs(diff[valid])
    hist_counts, hist_edges = np.histogram(hist_values, bins=24)
    difference_histogram = [
        {"binStart": float(hist_edges[i]), "binEnd": float(hist_edges[i + 1]), "count": int(hist_counts[i])}
        for i in range(len(hist_counts))
    ]
    logger.info("FITS comparison finished in %.2fs", time.perf_counter()-started)
    return {
        "first": first.filename, "second": second.filename,
        "firstPreview": first_preview, "secondAlignedPreview": second_preview,
        "epochs": {"first": first_epoch, "second": second_epoch, "deltaDays": delta_days},
        "alignment": {"method": "Astropy celestial WCS + reproject_interp bilinear resampling", "referenceGrid": "first image WCS", "overlapFraction": float(valid.sum() / valid.size), "backgroundOffsetApplied": offset, "photometricCalibration": False},
        "firstSourceCount": len(src_a), "secondSourceCount": len(src_b), "matchedSources": matched,
        "differenceSourceCandidates": diff_sources[:100], "differencePreview": diff_preview,
        "differenceHistogram": difference_histogram,
        "motionCandidates": moving[:100],
        "matchSummary": {
            "matched": len(matched),
            "unmatchedFirst": max(0, len(src_a) - len(matched)),
            "unmatchedSecond": max(0, len(src_b) - len(matched)),
            "totalDetections": len(src_a) + len(src_b),
        },
        "differenceStatistics": {"median": float(np.nanmedian(diff[valid])), "std": float(np.nanstd(diff[valid])), "maxAbs": float(np.nanmax(np.abs(diff[valid])))},
        "provenance": "Computed from the two user-uploaded FITS files. This is not an official SPHEREx pipeline product.",
        "caution": "Nearest-neighbour association within 30 arcsec is a screening heuristic. Robust moving-object discovery requires PSF matching, astrometric uncertainty, detector masks, calibrated fluxes, validated multi-epoch association and known-object cross-matching. This screening result is not a Planet Nine detection.",
    }


@app.post("/api/reports/pdf")
async def create_pdf_report(payload: dict[str, Any]):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib import colors
        out = io.BytesIO(); doc = SimpleDocTemplate(out, pagesize=A4, title="Galaxy Divers Scientific Screening Report")
        styles = getSampleStyleSheet(); story = [Paragraph("Galaxy Divers · Scientific Screening Report", styles["Title"]), Spacer(1, 12)]
        story.append(Paragraph("Research screening output — not a confirmed astronomical discovery.", styles["BodyText"]))
        story.append(Spacer(1, 12))
        rows = [["Field", "Value"]]
        for key in ["target", "ra", "dec", "firstEpoch", "secondEpoch", "deltaDays", "firstSourceCount", "secondSourceCount", "matchedCount", "candidateCount"]:
            rows.append([key, str(payload.get(key, "Not supplied"))[:180]])
        table = Table(rows, colWidths=[130, 350]); table.setStyle(TableStyle([("BACKGROUND", (0,0),(-1,0),colors.HexColor("#12334a")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("GRID",(0,0),(-1,-1),0.4,colors.grey),("PADDING",(0,0),(-1,-1),7)])); story.append(table)
        story.append(Spacer(1, 14))
        story.append(Paragraph("Method and limitations", styles["Heading2"]))
        story.append(Paragraph(str(payload.get("method", "FITS screening and WCS-based comparison."))[:2500], styles["BodyText"]))
        story.append(Spacer(1, 10)); story.append(Paragraph("Data provenance: NASA/IPAC IRSA archive links must be retained with the original observations. User-uploaded FITS inputs are identified separately from archive products.", styles["BodyText"]))
        doc.build(story); out.seek(0)
        return StreamingResponse(out, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=galaxy-divers-screening-report.pdf"})
    except Exception as exc:
        logger.exception("PDF report generation failed")
        raise HTTPException(status_code=500, detail=f"PDF report generation failed: {type(exc).__name__}: {str(exc)[:250]}") from exc
