# n8n workflows — World Cup Sweepstake draw

Two workflows power the local draw page. n8n talks to Google Sheets **live**
(via the Sheets API, no caching), so the draw always sees the true set of
unfilled rows and free teams — unlike the public board (`index.html`), which
reads the slower *published* CSV and is allowed to lag.

**Status: both workflows are built, configured, active, and tested in the
local n8n instance** (`http://localhost:5678`). These JSON files mirror the
live workflows and exist as an import fallback / source-controlled copy.

| File | Endpoint | Job |
|------|----------|-----|
| `world-cup-read.workflow.json`  | `GET  http://localhost:5678/webhook/wc-sweepstake-read`  | Read both groups + the teams tabs live, return the raw rows (incl. `row_number`). |
| `world-cup-write.workflow.json` | `POST http://localhost:5678/webhook/wc-sweepstake-write` | Update the drawn person's **Team** cell, matched on `row_number`. |

Spreadsheet: **Astute World Cup Sweepstake**
(`1TZC-fFB-an8Jf1mvMIH4Tc9ppD6tqEXk4crWv1Jy31M`).
Credential: **Google Sheets account** (`fbjo8wjmhy3kj1DR`).

---

## How the page uses them

`server.js` proxies the local page to n8n (keeps the webhook URLs out of the
browser and avoids CORS):

- `GET /api/sheet-live` → read webhook → page builds its draw state from this.
- `POST /api/assign`    → write webhook → writes the chosen team back.
- `GET /api/sheet`      → published CSV (kept as an **offline fallback** only).

The page (`assign.html`) tries `/api/sheet-live` first and falls back to the
published CSV if n8n is unreachable.

### Run it

```sh
node server.js            # http://localhost:8080
# open http://localhost:8080/assign.html
```

No env vars needed — `server.js` defaults to the two `localhost:5678` webhooks
above. Override with `N8N_SHEET_READ_WEBHOOK_URL` / `N8N_ASSIGNMENT_WEBHOOK_URL`
if your n8n moves.

---

## Design notes (why it's built this way)

- **Reads are bounded to `A1:H49`** and set to **`executeOnce`**. Without
  `executeOnce`, n8n runs each chained read once *per incoming item*, so 48
  rows from Group 1 caused Group 2 to execute 48× (2,304 rows) and blew through
  Google's *60 reads/min/user* quota. `executeOnce` makes each read fire once.
- The read stays "dumb" — it returns raw rows and the **page** does the
  filtering and (future) reveal animation, so the page holds all the data.
- The write matches on `row_number`, the robust way to hit an exact row, and
  reads `sheetGid` / `person.rowNumber` / `update.value` from the page payload.

## Payload contract

**Read** returns:

```json
{
  "group1":   [ { "First Name": "...", "Last initial": "...", "Team": "", "Paid?": true, "row_number": 2 } ],
  "group2":   [ ... ],
  "allTeams": [ { "Confederation": "UEFA", "Country": "England", "Eliminated?": false } ],
  "teamCodes":[ { "Country": "England", "FIFA Code": "ENG", "ISO Code": "GB" } ]
}
```

**Write** receives the assignment the page builds and uses three fields…

```json
{ "sheetGid": "0", "person": { "rowNumber": 7 }, "update": { "value": "Brazil" } }
```

…then responds `{ "ok": true, "row": 7, "team": "Brazil" }`.

## Re-importing (fallback only)

If you ever need to rebuild from these files: in n8n, **Workflows → ⋮ → Import
from File**, then on each Google Sheets node re-select the **Google Sheets
credential** (credentials are never stored in an export). Everything else —
document, sheets, ranges, mapping — is already filled in.

## Assumptions / gotchas

- **All data lives in the first 49 rows of every tab** (header + 48). The reads
  are capped to `A1:H49` on that basis; keep the lists within that range.
- Row targeting uses the sheet's real `row_number`, returned by the read.
- The **public board still reads the published CSV**, so it can lag a minute or
  two behind a fresh assignment. Expected — the draw never relies on it.
- England/Scotland ISO codes contain a stray "⚠️" in the sheet; the page's
  code-cleaning strips it to `GB`, so flags still resolve.
