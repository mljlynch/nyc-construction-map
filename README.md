# NYC new residential construction map

Static map of new building jobs by 2020 NTA and month (2010 to now). No backend.

```bash
uv run pipeline/build_data.py                 # new buildings + DOB NOW freshness layer
uv run pipeline/build_data.py --include-alterations   # also unit-adding alterations
uv run pipeline/build_data.py --stale-years 0 # never age out unfinished jobs from "in progress"
uv run pipeline/build_data.py --refresh       # re-download (API responses cache in pipeline/.cache)
python3 -m http.server 8765 --directory web   # then open http://localhost:8765
```

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
- The color scale uses quantile breaks over every month in the current view. This keeps the 2015 and 2022 421-a filing spikes from washing out the rest of the map, and keeps playback comparable from month to month.
