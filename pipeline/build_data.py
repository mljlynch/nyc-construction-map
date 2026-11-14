# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas>=2.1", "shapely>=2.0", "requests>=2.31"]
# ///
"""Build static JSON for the NYC new-construction map.

Run with:  uv run pipeline/build_data.py [--include-alterations] [--no-dob-now]

Outputs (in web/data/):
  ntas.geojson   2020 NTA polygons (simplified), properties: nta, name, boro
  series.json    NTA x month arrays for permitted/completed/in-progress jobs+units
  meta.json      month axis, data vintages, options used
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from shapely import STRtree, points
from shapely.geometry import mapping, shape

SODA = "https://data.cityofnewyork.us/resource"
HDB_ID = "br6q-ssj3"  # DCP Housing Database Project Level Files
FILINGS_ID = "w9ak-ipjd"  # DOB NOW: Build - Job Application Filings
PERMITS_ID = "rbx6-tga4"  # DOB NOW: Build - Approved Permits
NTA_ID = "9nt8-h7nd"  # 2020 Neighborhood Tabulation Areas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data"
CACHE = ROOT / "pipeline" / ".cache"

# HDB only records completions from 2010 on, so earlier months would be incomplete.
START_MONTH = pd.Period("2010-01", "M")
BOROS = {"1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island"}
# DOB's building-class and occupancy fields are blank or "Other" for a large share of new buildings,
# so type is derived from the finished building's unit count, which every job has.
BUILDING_TYPES = ["Houses (1–2 units)", "Small multifamily (3–9)", "Mid-size apartments (10–49)", "Large apartments (50+)"]
SIZE_BINS = [-np.inf, 2, 9, 49, np.inf]
# Permit cohort used to learn typical permit-to-completion times. These years are old enough that
# 92-97% of their jobs have finished, so the durations aren't biased toward fast jobs.
TRAIN_YEARS = (2014, 2019)
MIN_SAMPLE = 20
HORIZON_MONTHS = 36
JOB_COLS = ["job_number", "job_type", "units", "size", "bin", "permit", "complete", "nta2020", "source", "lat", "lon", "address"]
BORO_FROM_NTA = {"MN": "Manhattan", "BX": "Bronx", "BK": "Brooklyn", "QN": "Queens", "SI": "Staten Island"}


def soda(dataset: str, select: str, where: str, order: str, page: int = 50000) -> pd.DataFrame:
    """Page through a Socrata dataset, caching the raw result to disk."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / f"{dataset}-{hashlib.sha1((select + where).encode()).hexdigest()[:10]}.json"
    if key.exists():
        return pd.DataFrame(json.loads(key.read_text()))
    rows, offset = [], 0
    while True:
        r = requests.get(
            f"{SODA}/{dataset}.json",
            params={"$select": select, "$where": where, "$order": order, "$limit": page, "$offset": offset},
            timeout=120,
        )
        r.raise_for_status()
        batch = r.json()
        rows += batch
        print(f"  {dataset}: {len(rows):,} rows", file=sys.stderr)
        if len(batch) < page:
            break
        offset += page
    key.write_text(json.dumps(rows))
    return pd.DataFrame(rows)


def load_ntas() -> tuple[list[dict], STRtree, list[str]]:
    r = requests.get(f"{SODA}/{NTA_ID}.geojson", params={"$limit": 1000}, timeout=120)
    r.raise_for_status()
    feats = []
    geoms, codes = [], []
    for f in r.json()["features"]:
        p = f["properties"]
        g = shape(f["geometry"])
        geoms.append(g)
        codes.append(p["nta2020"])
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "nta": p["nta2020"],
                    "name": p["ntaname"],
                    "boro": p["boroname"],
                    # 9 = parks/cemeteries, 8 = airports etc.; front end dims them.
                    "ntatype": p.get("ntatype"),
                },
                "geometry": mapping(g.simplify(0.00008, preserve_topology=True)),
            }
        )
    return feats, STRtree(geoms), codes


def load_hdb(include_alterations: bool) -> pd.DataFrame:
    types = ["'New Building'"] + (["'Alteration'"] if include_alterations else [])
    df = soda(
        HDB_ID,
        select="job_number,job_type,job_status,classanet,classaprop,boro,bin,datepermit,datecomplt,nta2020,version,"
        "latitude,longitude,addressnum,addressst",
        where=f"job_type in ({','.join(types)}) AND job_status != '9. Withdrawn'",
        order="job_number",
    )
    df["units"] = pd.to_numeric(df["classanet"], errors="coerce").fillna(0)
    df["size"] = pd.to_numeric(df["classaprop"], errors="coerce").fillna(df.units)
    # Alterations that remove units net out negative; for a construction map we only count additions.
    if include_alterations:
        df = df[(df.job_type == "New Building") | (df.units > 0)]
    df["permit"] = pd.to_datetime(df["datepermit"], errors="coerce")
    df["complete"] = pd.to_datetime(df["datecomplt"], errors="coerce")
    # "Completed" means a first CO was issued; HDB sets datecomplt only for those.
    df["source"] = "hdb"
    df["lat"] = pd.to_numeric(df.latitude, errors="coerce")
    df["lon"] = pd.to_numeric(df.longitude, errors="coerce")
    df["address"] = (df.addressnum.fillna("") + " " + df.addressst.fillna("")).str.strip()
    df.attrs["version"] = df.version.dropna().iloc[0]
    return df[JOB_COLS]


def load_dob_now(hdb: pd.DataFrame, after: pd.Timestamp, ntree: STRtree, ncodes: list[str]) -> pd.DataFrame:
    """New-building jobs whose first permit is after the HDB vintage, as a freshness layer."""
    filings = soda(
        FILINGS_ID,
        select="job_filing_number,bin,proposed_dwelling_units,existing_dwelling_units,"
        "first_permit_date,filing_status,latitude,longitude,house_no,street_name",
        where="job_type='New Building' AND first_permit_date IS NOT NULL",
        order="job_filing_number",
    )
    filings["job"] = filings.job_filing_number.str.split("-").str[0]
    filings["permit"] = pd.to_datetime(filings.first_permit_date, errors="coerce")
    filings["units"] = pd.to_numeric(filings.proposed_dwelling_units, errors="coerce").fillna(0) - pd.to_numeric(
        filings.existing_dwelling_units, errors="coerce"
    ).fillna(0)
    filings["size"] = pd.to_numeric(filings.proposed_dwelling_units, errors="coerce").fillna(0)

    # Approved Permits carries the actual issuance date per work permit; take the earliest per job
    # for the window we care about (older jobs already have their first permit in the filings table).
    permits = soda(
        PERMITS_ID,
        select="job_filing_number,issued_date",
        where=f"issued_date >= '{(after - pd.Timedelta(days=60)).date()}' AND filing_reason = 'Initial Permit'",
        order="job_filing_number",
    )
    permits["job"] = permits.job_filing_number.str.split("-").str[0]
    permits["issued"] = pd.to_datetime(permits.issued_date, errors="coerce")
    first_issued = permits.groupby("job").issued.min()

    # One record per job: earliest permit date across both sources; units/location from the
    # latest filing (subsequent filings amend the initial one).
    filings = filings.sort_values("job_filing_number")
    jobs = filings.groupby("job").agg(
        permit=("permit", "min"),
        units=("units", "last"),
        size=("size", "last"),
        bin=("bin", "last"),
        lat=("latitude", "last"),
        lon=("longitude", "last"),
        status=("filing_status", "last"),
        house=("house_no", "last"),
        street=("street_name", "last"),
    )
    jobs["permit"] = pd.concat([jobs.permit, first_issued.reindex(jobs.index)], axis=1).min(axis=1)
    jobs = jobs[(jobs.permit > after) & (jobs.status != "Filing Withdrawn")]
    # HDB already knows about jobs it picked up; its job numbers differ, so match on BIN.
    jobs = jobs[~jobs.bin.isin(set(hdb.bin.dropna()))]

    jobs["lat"] = pd.to_numeric(jobs.lat, errors="coerce")
    jobs["lon"] = pd.to_numeric(jobs.lon, errors="coerce")
    jobs = jobs[jobs.lat.notna() & jobs.lon.notna()].copy()
    jobs["address"] = (jobs.house.fillna("") + " " + jobs.street.fillna("")).str.strip()
    pts = points(jobs.lon.to_numpy(), jobs.lat.to_numpy())
    pt_idx, poly_idx = ntree.query(pts, predicate="within")
    nta = np.full(len(jobs), None, dtype=object)
    nta[pt_idx] = np.array(ncodes, dtype=object)[poly_idx]
    jobs["nta2020"] = nta
    jobs = jobs.reset_index().rename(columns={"job": "job_number"})
    jobs["job_type"] = "New Building"
    jobs["complete"] = pd.NaT
    jobs["source"] = "dobnow"
    print(f"  DOB NOW freshness jobs after {after.date()}: {len(jobs)} ({int(jobs.units.sum())} units)", file=sys.stderr)
    return jobs[JOB_COLS]


def duration_model(jobs: pd.DataFrame) -> dict[int, np.ndarray]:
    """Sorted permit-to-completion durations (months) per building type, from the training cohort."""
    pm = jobs.permit.dt.to_period("M")
    done = jobs.complete.notna() & pm.notna()
    dur = (jobs.complete.dt.to_period("M") - pm)[done].map(lambda d: d.n)
    train = done & jobs.permit.dt.year.between(*TRAIN_YEARS) & (jobs.source == "hdb")
    dist = {t: np.sort(dur[train & (jobs.btype == t)].to_numpy()) for t in range(len(BUILDING_TYPES))}
    return {t: d[d >= 0] for t, d in dist.items()}


def remaining(dist: np.ndarray, elapsed: int, stale_months: int | None) -> np.ndarray | None:
    """Durations of comparable jobs that were still open after `elapsed` months, or None if too few.

    Conditioning on "still open" is what keeps an overdue job from being projected into the past.
    Durations at or past the staleness cutoff mean the job is treated as abandoned, not completed.
    """
    cand = dist[dist > elapsed]
    if len(cand) < MIN_SAMPLE:
        return None
    return cand if stale_months is None else np.minimum(cand, stale_months)


def estimate_completions(jobs: pd.DataFrame, dist: dict, last_actual: pd.Period, stale_years: int | None) -> pd.DataFrame:
    """Per open job: a marker month plus the likely range (25th-75th percentile) for its tooltip.

    The marker month is a fixed pseudo-random draw from the job's own conditional distribution
    (seeded by job number, so it's stable across runs). Drawing instead of using the median keeps
    marker counts in line with the expected values on the map: a median would pile overdue jobs
    into the same few months and ignore the chance a job is abandoned. A draw that lands past the
    staleness cutoff means the job gets no marker completion and leaves "in progress" when stale.
    """
    stale_months = 12 * stale_years if stale_years else None
    pm = jobs.permit.dt.to_period("M")
    out = pd.DataFrame({"est": pd.Series(pd.NaT, index=jobs.index, dtype="period[M]")})
    out["est_lo"] = out["est_hi"] = out["est"]
    open_ = pm.notna() & jobs.complete.isna()
    for i in jobs.index[open_]:
        cand = remaining(dist[jobs.btype[i]], (last_actual - pm[i]).n, stale_months)
        if cand is None:
            continue
        finishing = cand if stale_months is None else cand[cand < stale_months]
        if len(finishing):
            out.loc[i, "est_lo"] = pm[i] + int(np.percentile(finishing, 25))
            out.loc[i, "est_hi"] = pm[i] + int(np.percentile(finishing, 75))
        u = int(hashlib.sha1(str(jobs.job_number[i]).encode()).hexdigest()[:8], 16) / 16**8
        draw = int(cand[int(u * len(cand))])
        if stale_months is None or draw < stale_months:
            out.loc[i, "est"] = pm[i] + draw
    print(f"  estimated completions: {out.est.notna().sum()} of {open_.sum()} open jobs drew a completion month", file=sys.stderr)
    return out


def aggregate(jobs: pd.DataFrame, months: pd.PeriodIndex, stale_years: int | None, dist: dict, last_actual: pd.Period) -> dict:
    """Return {nta: {pj, pu, cj, cu, xj, xu, ij, iu}} arrays aligned to `months`.

    x = expected completions for jobs still open at `last_actual`: each job spreads its chance of
    finishing over future months using the durations of comparable jobs that were open as long
    (`remaining`). After `last_actual`, in progress for those jobs is likewise the expected number
    still open. Expected values are fractional; they're stored to one decimal.

    All-zero arrays are omitted to keep the file small; the front end treats a missing key as zeros.
    """
    n = len(months)
    idx = {p: i for i, p in enumerate(months)}
    stale_months = 12 * stale_years if stale_years else None
    jobs = jobs[jobs.nta2020.notna()].copy()
    jobs["pm"] = jobs.permit.dt.to_period("M")
    jobs["cm"] = jobs.complete.dt.to_period("M")
    la = idx.get(last_actual, n - 1)

    out: dict[str, dict[str, list]] = {}
    for nta, g in jobs.groupby("nta2020"):
        s = {k: np.zeros(n) for k in ("pj", "pu", "cj", "cu", "xj", "xu", "ij", "iu")}
        for flow, col in (("p", "pm"), ("c", "cm")):
            sub = g[g[col].notna() & (g[col] >= months[0]) & (g[col] <= months[-1])]
            for m, gg in sub.groupby(col):
                s[f"{flow}j"][idx[m]] += len(gg)
                s[f"{flow}u"][idx[m]] += gg.units.sum()
        # In progress at end of month m: permitted on/before m, not yet complete by m.
        # Difference arrays: +1 at permit month, -1 at the exit month (completion or staleness).
        ip = g[g.pm.notna()]
        dj, du = np.zeros(n + 1), np.zeros(n + 1)
        for pm, cm, bt, u in zip(ip.pm, ip.cm, ip.btype, ip.units):
            start = max(pm, months[0])
            if start > months[-1]:
                continue
            a = idx[start]
            cand = None if pd.notna(cm) else remaining(dist[bt], (last_actual - pm).n, stale_months)
            if cand is not None:
                # Open at last_actual with a usable model: certain until then, expected after.
                b = la + 1
                dj[a] += 1; dj[max(a, b)] -= 1; du[a] += u; du[max(a, b)] -= u
                offs = pm.ordinal - months[0].ordinal
                for t in range(max(a, b), n):
                    k = t - offs  # months since permit
                    still = (cand > k).mean()
                    s["ij"][t] += still
                    s["iu"][t] += still * u
                    if stale_months is None or k < stale_months:
                        p_done = (cand == k).mean()
                        s["xj"][t] += p_done
                        s["xu"][t] += p_done * u
                continue
            end = cm if pd.notna(cm) else None
            if stale_months is not None:
                stale = pm + stale_months
                end = stale if end is None or stale < end else end
            if end is not None and end <= start:
                continue
            b = idx[end] if end is not None and end <= months[-1] else n
            dj[a] += 1; dj[b] -= 1; du[a] += u; du[b] -= u
        s["ij"] += np.cumsum(dj)[:n]
        s["iu"] += np.cumsum(du)[:n]
        arrs = {}
        for k, v in s.items():
            if not v.any():
                continue
            frac = k[0] in "xi"
            arrs[k] = [round(float(x), 1) if frac else int(round(x)) for x in v]
            arrs[k] = [int(x) if float(x).is_integer() else x for x in arrs[k]]
        if arrs:
            out[nta] = arrs
    return out


def project_points(jobs: pd.DataFrame, months: pd.PeriodIndex, stale_years: int | None) -> dict:
    """One row per job with month indices so the front end can filter by month with no joins.

    Rows are [lon, lat, units, p, c, e, boro, address, flags, building type index, nta, x, x_lo, x_hi]: p = permit month, c = completion
    month, e = month the job leaves "in progress" (completion or staleness), all as offsets from
    months[0], with NEVER meaning never. A job is in progress at t when p <= t < e, matching
    `aggregate`. flags: "a" = alteration, "d" = from DOB NOW.
    """
    never = 99999
    m0 = months[0]
    boro_idx = {code: i for i, code in enumerate(BORO_FROM_NTA)}
    rows = []
    for r in jobs[jobs.lat.notna() & jobs.lon.notna() & jobs.nta2020.notna()].itertuples():
        p = (r.permit.to_period("M") - m0).n if pd.notna(r.permit) else never
        c = (r.complete.to_period("M") - m0).n if pd.notna(r.complete) else never
        if p == never and c == never:
            continue  # filed or approved only: never permitted, so never on the map
        x = (r.est - m0).n if pd.notna(r.est) else never
        x_lo = (r.est_lo - m0).n if pd.notna(r.est_lo) else never
        x_hi = (r.est_hi - m0).n if pd.notna(r.est_hi) else never
        exit_ = c if c != never else x
        e = exit_ if p == never or stale_years is None else min(exit_, p + 12 * stale_years)
        flags = ("a" if r.job_type == "Alteration" else "") + ("d" if r.source == "dobnow" else "")
        rows.append([round(r.lon, 5), round(r.lat, 5), int(r.units), p, c, e, boro_idx[r.nta2020[:2]], r.address.title(), flags, int(r.btype), r.nta2020, x, x_lo, x_hi])
    # Big projects last so they draw on top of the small ones around them.
    rows.sort(key=lambda row: row[2])
    return {"never": never, "boros": [BORO_FROM_NTA[k] for k in BORO_FROM_NTA], "rows": rows}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--include-alterations", action="store_true", help="also count Alteration jobs that add units")
    ap.add_argument("--no-dob-now", action="store_true", help="skip the DOB NOW freshness layer")
    ap.add_argument(
        "--stale-years",
        type=int,
        default=8,
        help="drop a permitted job from 'in progress' this many years after its permit if it never "
        "completed (abandoned jobs otherwise sit in progress forever); 0 disables",
    )
    ap.add_argument("--refresh", action="store_true", help="ignore cached API responses")
    args = ap.parse_args()

    if args.refresh and CACHE.exists():
        for f in CACHE.glob("*.json"):
            f.unlink()

    OUT.mkdir(parents=True, exist_ok=True)
    print("Loading NTAs…", file=sys.stderr)
    feats, ntree, ncodes = load_ntas()
    print("Loading Housing Database…", file=sys.stderr)
    hdb = load_hdb(args.include_alterations)
    hdb_version = hdb.attrs["version"]
    hdb_cutoff = hdb.permit.max()
    jobs = [hdb]
    if not args.no_dob_now:
        print("Loading DOB NOW freshness layer…", file=sys.stderr)
        jobs.append(load_dob_now(hdb, hdb_cutoff, ntree, ncodes))
    jobs = pd.concat(jobs, ignore_index=True)
    jobs["btype"] = pd.cut(jobs["size"], SIZE_BINS, labels=False).astype(int)

    # Last month with complete completion data: HDB's cutoff month is usually partial (e.g. July 2).
    last_actual = (hdb.complete.max() + pd.Timedelta(days=1)).to_period("M") - 1
    dist = duration_model(jobs)
    medians = {BUILDING_TYPES[t]: int(np.median(d)) for t, d in dist.items() if len(d)}
    jobs[["est", "est_lo", "est_hi"]] = estimate_completions(jobs, dist, last_actual, args.stale_years or None)
    data_end = max(jobs.permit.max(), jobs.complete.max()).to_period("M")
    # Expected completions taper off for years; stop the axis once most projected units are in.
    end = max(data_end, last_actual + HORIZON_MONTHS)
    months = pd.period_range(START_MONTH, end, freq="M")
    series = aggregate(jobs, months, args.stale_years or None, dist, last_actual)

    # Borough totals are summed client-side from NTA series, so jobs without an NTA would vanish.
    unplaced = jobs[jobs.nta2020.isna()]
    meta = {
        "months": [str(m) for m in months],
        "hdbVersion": hdb_version,
        "hdbPermitCutoff": str(hdb_cutoff.date()),
        "hdbCompleteCutoff": str(hdb.complete.max().date()),
        "provisionalFrom": None if args.no_dob_now else str((hdb_cutoff + pd.Timedelta(days=1)).to_period("M")),
        "includeAlterations": args.include_alterations,
        "staleYears": args.stale_years or None,
        "dataEnd": str(data_end),
        "projectedFrom": str(last_actual + 1),
        "estimateTrainYears": list(TRAIN_YEARS),
        "estimateMedians": medians,
        "unplacedJobs": int(len(unplaced)),
        "unplacedUnits": int(unplaced.units.sum()),
        "boros": list(BOROS.values()),
        "buildingTypes": BUILDING_TYPES,
    }

    (OUT / "ntas.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    (OUT / "projects.json").write_text(
        json.dumps(project_points(jobs, months, args.stale_years or None), separators=(",", ":"))
    )
    (OUT / "series.json").write_text(json.dumps(series, separators=(",", ":")))
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2))
    tot = {k: sum(sum(v.get(k, [])) for v in series.values()) for k in ("pj", "pu", "cj", "cu")}
    print(f"Wrote {len(series)} NTAs x {len(months)} months. Totals: {tot}. Unplaced jobs: {len(unplaced)}", file=sys.stderr)


if __name__ == "__main__":
    main()
