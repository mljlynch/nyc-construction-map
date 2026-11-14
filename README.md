# NYC new residential construction map

Static map of new building jobs by 2020 NTA and month (2010 to now, plus estimated completions). No backend.

Live at **https://nychousingmap.com** (Vercel; every push to `main` deploys).

```bash
uv run pipeline/build_data.py                 # new buildings + DOB NOW freshness layer
uv run pipeline/build_data.py --include-alterations   # also unit-adding alterations
uv run pipeline/build_data.py --stale-years 0 # never age out unfinished jobs from "in progress"
uv run pipeline/build_data.py --refresh       # re-download (API responses cache in pipeline/.cache)
npm install && npm run dev                    # Next.js dev server at http://localhost:3000
npm run build && npm start                    # production build locally
npm run typecheck
```

## Sharing and analytics

- Filters are kept in the query string, e.g. `?measure=buildings&stage=completed&from=2015-01&to=2016-12&borough=Brooklyn&neighborhoods=BK0101,BK0203&selected=BK0101`. Defaults are omitted. The Copy link button copies the current view.
- Vercel Web Analytics loads from `/_vercel/insights/script.js`. Only the first pageview per visit is sent, so filter changes don't count as extra pageviews.

## How it's served

A Next.js (App Router) app on Vercel.

- `app/page.tsx` reads the filters from the URL on the server, so a shared link renders the right view from the first paint. `components/` holds the client UI (`HousingMap` owns the filters, URL sync and data fetching; `MapView`, `Controls`, `TimeBar`, `BoroughTotals`, `NeighborhoodPanel`, `Notes`).
- `lib/filters.ts` parses and serializes filters for the page URL and the API alike.
- API routes in `app/api/` take the same query parameters as page links and return only what that view needs:
  - `/api/choropleth`: per-neighborhood values, color breaks and borough totals
  - `/api/projects`: GeoJSON of the matching projects (markers)
  - `/api/series`: monthly history for `selected` or the picked `neighborhoods`
  - `/api/meta`, `/api/neighborhoods`: static metadata and NTA boundaries
  Responses are cached on Vercel's CDN per URL for a day; a deploy clears that cache.
- `lib/data/queries.ts` runs those filters; `lib/data/store.ts` is the `DataStore` they read from. Today that's `JsonFileStore` over the pipeline's output in `data/` (shipped with the functions via `next.config.ts`). To move to a database, add another `DataStore` (or rewrite the queries as SQL against it) and switch `getStore()`; routes and components stay the same.

## Data

| Source | Socrata id | Used for |
|---|---|---|
| DCP Housing Database Project Level Files | `br6q-ssj3` | Primary jobs: `job_type`, `job_status`, `classanet` (net units), `datepermit`, `datecomplt`, `nta2020`, `bin` |
| DOB NOW: Build – Job Application Filings | `w9ak-ipjd` | NB jobs permitted after the HDB vintage: `first_permit_date`, proposed − existing units, lat/lon |
| DOB NOW: Build – Approved Permits | `rbx6-tga4` | Earliest `issued_date` per job (Initial Permit) |
| 2020 NTAs | `9nt8-h7nd` | Geometry; DOB NOW points are joined spatially (its `nta` field mixes 2010/2020 names) |

## Project markers

`web/data/projects.json` has one row per job (lon, lat, units, permit / completion / in-progress-exit month index, borough, address). The page shows each job as a circle with area proportional to its units, filtered to the same month, stage and borough as the choropleth. Jobs that were never permitted or completed are left out because no view would show them.

## Definitions

- **Permitted**: by first permit date. **Completed**: by first certificate of occupancy date.
- **In progress** at month *m*: permitted on or before *m* and not completed by *m*. Jobs that stay open more than `--stale-years` (default 8) years after their permit are dropped as likely abandoned.
- **Building type** is set by the finished building's unit count (`classaprop`, or proposed dwelling units for DOB NOW jobs): houses (1–2), small multifamily (3–9), mid-size apartments (10–49), large apartments (50+). DOB's `bldg_class` and `occ_prop` are blank or "Other" for too many new buildings to use. It appears in project tooltips.
- The Neighborhoods menu limits the map, markers, totals and chart to the chosen NTAs (combined in the side panel).
- The time slider selects a start and end month. Permitted and completed show totals over that range, and in progress shows the snapshot at the end month.
- Withdrawn jobs are excluded. With `--include-alterations`, only alterations that add units count.
- DOB NOW jobs are deduplicated to one per job number (the part of `job_filing_number` before `-`), using the earliest permit date. They are dropped if HDB already has an NB job on the same BIN, because the two systems use different job numbers.
- The timeline starts in 2010 because HDB only covers jobs completed in 2010 or later.
- Months after the HDB permit cutoff are marked provisional for permits.
- **Estimated completions.** None of the sources have an anticipated completion date, so completions after the last full month of HDB completion data are estimated. Each permitted, unfinished job gets a distribution of finish months from same-type jobs permitted in 2014–2019 (92–97% of which have finished) that were still open at the same age. Map and borough totals use the expected value per month (`xj`/`xu` in `series.json`), and in progress after that month is the expected number still open. Each project marker is placed at a month drawn from its own distribution, seeded by job number, so marker counts track the expected totals; tooltips show the 25th–75th percentile range. Estimates cover only jobs already permitted, so later years undercount what will actually finish. Jobs open longer than nearly all past examples get no estimate. The axis runs 36 months past the last actual completion.
- Units use fixed color thresholds (1–49, 50–99, 100–149, 150–299, 300–499, 500–999, 1,000+). Building counts use rounded quantile breaks over every window of the selected length.
