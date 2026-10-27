# Foundry in Motion

A single-file, animated customer guide to Microsoft Foundry. It is domain-neutral so you can reuse it for any customer, and every section links to the official docs at `learn.microsoft.com/azure/foundry`.

**Open:** `dist/foundry-in-motion.html` (self-contained; no server or internet needed except for the doc links).

## Features
- 21 sections from "create a project" to "AI Gateway", with animated diagrams
- Motion on/off switch (saved in the browser; defaults to off when the OS requests reduced motion), light/dark theme, Expand all
- Interactive portal map, deployment-type chooser, token cost estimator, CCU forecast, hosted agent session lifecycle
- Calculators use placeholder rates; the presenter enters real ones

## Edit and rebuild
```powershell
python build.py            # rebuild dist/foundry-in-motion.html
python build.py --check    # also verify every learn.microsoft.com link returns 200
```
- Content lives in `src/sections/NN-*.html`. Add docs links with `{{doc:path|Label}}` (resolves to `https://learn.microsoft.com/en-us/azure/foundry/<path>`) or `{{url:https://...|Label}}`.
- Styles: `src/styles.css`. Behavior: `src/app.js`.
- Optional UI smoke test: `pip install playwright`, then `python smoke_test.py` (uses Microsoft Edge headless).

## Grounding
Facts come from Microsoft Learn pages read in October 2026. Items marked Preview change often: re-run the link check and re-read the linked page before each customer session.
