# Golden Cleaning Tracker — local prototype (phases 1–2)

Spec: `Golden Cleaning Tracker - Spec.pdf` (text copy in `spec.txt`). Screenshots in `screenshots/`.

## Run it

```
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/web/ — no installs needed.

Sample logins (PIN): Maria 1111, Ana 2222, Julia 3333 (both have a reopened day with a note), Sandra 9999 (dashboard is phase 3).
"Reset sample data" is at the bottom of the login screen.

## Layout

- `backend/` — all business rules. Plain JS with no browser APIs, written to be pasted into Apps Script later.
  - `api.js` — `GCT.createApi(store).call(action, args, token)`; the future `doPost` router.
  - `seed.js`, `dates.js` — sample data and date helpers.
- `web/` — frontend. `store.js` is a localStorage stand-in for the Google Sheet; `app.js` / `styles.css` are the UI.

## Moving to Google (later)

1. Replace `web/store.js` with a Sheets-backed store (same `transaction` / `nextId` interface, wrapped in `LockService`).
2. Add `doPost` that calls `GCT.createApi(store).call(...)`; deploy as a Web App (`clasp` needs Node).
3. Point the frontend's `call()` at the Web App URL with `fetch`.

## Decisions made (change if wrong)

- Cleaners log hours freely (not picked from Jobber-synced jobs); `billed_rate` / `jobber_job_id` stay null until the Jobber phase.
- Cleaners can log up to 4 weeks back, never future days; overlapping entries on one day are rejected.
- Confirming needs at least one entry. Prototype data lives in the browser only.

## Sample data

`seed-data.json` is the original data from the Cowork prototype and is the source of truth. `backend/seed.js` is generated from it:
the current week is exactly the prototype's entries, statuses and reopen notes. That file only covers one week, so the four
earlier weeks are filled from the weekly pattern on the prototype's Entries screenshot (all confirmed).
Client billing-rate histories in the JSON are intentionally not loaded: the spec replaces them with per-visit rates from Jobber.
Sandra's PIN is 9999 (from the JSON).
