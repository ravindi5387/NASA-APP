# Galaxy Divers v13 — Challenge target selector fix

## What changed
- The Explorer target dropdown now always enables all five challenge targets.
- Selecting any target immediately loads its local illustrative preview and updates RA/Dec.
- Target selection no longer depends on whether a local archive sequence exists. Archive coverage is a separate live-search step.
- Barnard's Star name handling is normalized for straight/curly apostrophes so the matching preview configuration is used consistently.
- Barnard's Star and R Draconis reference coordinates are also displayed in the target library instead of the old “Catalogue lookup required” placeholders.

## Scientific-data note
The local target previews are simulated educational illustrations, not SPHEREx observations. The UI labels them accordingly. To use real science data, select the target and run the live NASA/IPAC IRSA archive search; only returned products with verified coverage should be treated as observations.

## Run
From the project root in PowerShell:

```powershell
npm ci
npm run dev
```

Start the backend in a second terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
