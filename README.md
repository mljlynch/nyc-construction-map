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
- Withdrawn jobs are excluded. With `--include-alterations`, only alterations that add units count.
- DOB NOW jobs are deduplicated to one per job number (the part of `job_filing_number` before `-`), using the earliest permit date. They are dropped if HDB already has an NB job on the same BIN, because the two systems use different job numbers.
- The timeline starts in 2010 because HDB only covers jobs completed in 2010 or later.
- Months after the HDB permit cutoff are marked provisional. HDB completions stop at its completion cutoff, so in-progress counts after that date run high.
- The color scale uses quantile (or log) breaks over every month in the current view. This keeps the 2015 and 2022 421-a filing spikes from washing out the rest of the map, and keeps playback comparable from month to month.
