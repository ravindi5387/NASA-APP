# Galaxy Divers — Sinhala Quick Start

## අවශ්‍ය දේ
- Node.js (frontend එකට)
- Python 3.14 හෝ 3.13 (backend එකට)
- Internet connection (NASA/IPAC IRSA archive සහ Aladin Lite සඳහා)

## Backend එක start කිරීම
`galaxy-divers` project root එකේ සිට `start-backend.bat` double-click කරන්න. නැත්නම් VS Code terminal එකේ:

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Python 3.14 නැත්නම් `-3.14` වෙනුවට `-3.13` භාවිතා කරන්න. Backend terminal එක වහන්න එපා.

## Frontend එක start කිරීම
අලුත් VS Code terminal එකක් open කරලා:

```powershell
npm ci
npm run dev
```

Browser එකෙන් terminal එකේ පෙන්වන Vite URL එක open කරන්න. Backend සහ frontend terminals දෙකම open තියාගන්න.

## FITS analysis භාවිතය
1. Explore page එකේ NASA/IPAC IRSA archive search කරන්න.
2. Archive result එක expand කරලා **Download original FITS for analysis** තෝරන්න.
3. Science Lab page එකට ගිහින් Single FITS inspection හෝ Multi-epoch comparison තෝරන්න.
4. Epoch දෙකක් compare කරනවා නම් FITS files දෙක සහ නිවැරදි observation dates දෙන්න.
5. Align · Detect · Compare click කරලා difference image, source matches සහ motion-screening candidates බලන්න.
6. PDF screening report export කරන්න.

## විද්‍යාත්මක වැදගත් සටහන
මෙය official SPHEREx pipeline එක නොවේ. WCS alignment සහ threshold-based source screening සිදු කරන research prototype එකකි. PSF matching, full photometric calibration, variance propagation, detector-flag interpretation සහ external known-object cross-match තවදුරටත් අවශ්‍යයි. Candidate එකක් Planet Nine සොයාගැනීමක් ලෙස හඳුන්වන්න එපා.
