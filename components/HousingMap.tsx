'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isNarrowed, queryString, toSearchParams, type FilterContext, type Filters } from '@/lib/filters';
import type { ChoroplethResponse, Meta, NeighborhoodInfo, ProjectsResponse, SeriesResponse } from '@/lib/types';
import { BoroughTotals } from './BoroughTotals';
import { Controls } from './Controls';
import { MapView } from './MapView';
import { NeighborhoodPanel } from './NeighborhoodPanel';
import Link from 'next/link';
import { MadeBy } from './MadeBy';
import { NeighborhoodRanking } from './NeighborhoodRanking';
import { TimeBar } from './TimeBar';

// One fetched, consistent view. The map, markers and side panels all render from the same snapshot,
// so they change together even though they come from three routes.
export interface Snapshot {
  filters: Filters;
  choropleth: ChoroplethResponse;
  projects: ProjectsResponse;
  series: SeriesResponse | null;
}

const FETCH_DELAY = 120; // debounce while dragging the slider
const URL_DELAY = 250;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json() as Promise<T>;
}

export function HousingMap({ meta, ctx, neighborhoods, initialFilters }: { meta: Meta; ctx: FilterContext; neighborhoods: NeighborhoodInfo[]; initialFilters: Filters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const months = meta.months;
  const N = months.length;
  const s = months.indexOf(filters.from), e = months.indexOf(filters.to);

  const update = useCallback((patch: Partial<Filters>) => setFilters(f => ({ ...f, ...patch })), []);
  const setRange = useCallback((a: number, b: number) => {
    a = Math.max(0, Math.min(N - 1, a)); b = Math.max(0, Math.min(N - 1, b));
    if (a > b) [a, b] = [b, a];
    update({ from: months[a], to: months[b] });
  }, [N, months, update]);

  // Fetch the filtered view. Each change aborts the previous request, so a slow response can't
  // overwrite a newer one.
  const apiQuery = useMemo(() => queryString(toSearchParams(filters, ctx, true)), [filters, ctx]);
  const latestFilters = useRef(filters);
  latestFilters.current = filters;
  useEffect(() => {
    const ctrl = new AbortController();
    const q = apiQuery;
    const filters = latestFilters.current;
    const wantsSeries = !!(filters.selected || filters.neighborhoods.length);
    const timer = setTimeout(async () => {
      try {
        const [choropleth, projects, series] = await Promise.all([
          getJson<ChoroplethResponse>(`/api/choropleth${q}`, ctrl.signal),
          getJson<ProjectsResponse>(`/api/projects${q}`, ctrl.signal),
          wantsSeries ? getJson<SeriesResponse>(`/api/series${q}`, ctrl.signal) : Promise.resolve(null),
        ]);
        setSnap({ filters, choropleth, projects, series });
        setError(false);
      } catch (err) {
        if (!ctrl.signal.aborted) { console.error(err); setError(true); }
      }
    }, FETCH_DELAY);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [apiQuery]);

  // Keep the filters in the address bar (without adding history entries) so the view can be shared.
  const shareUrl = useMemo(() => queryString(toSearchParams(filters, ctx)), [filters, ctx]);
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(history.state, '', shareUrl || location.pathname), URL_DELAY);
    return () => clearTimeout(t);
  }, [shareUrl]);

  const setBorough = useCallback((borough: string | null) => {
    // Neighborhoods outside the new borough drop out of the selection.
    setFilters(f => ({ ...f, borough, neighborhoods: borough ? f.neighborhoods.filter(n => ctx.ntaBoro[n] === borough) : f.neighborhoods }));
  }, [ctx]);

  return (
    <div className="app">
      <Controls
        filters={filters}
        boroughs={meta.boros}
        neighborhoods={neighborhoods}
        shareUrl={shareUrl}
        onChange={update}
        onBorough={setBorough}
      />
      <MapView
        meta={meta}
        ctx={ctx}
        snap={snap}
        error={error}
        fitKey={isNarrowed(filters) ? `${filters.borough}|${[...filters.neighborhoods].sort().join()}` : ''}
        filters={filters}
        onSelect={nta => update({ selected: nta })}
      />
      {/* Sits directly under the map (outside the scrolling side panel) so it's always visible. */}
      <footer className="map-foot">
        <Link href="/about">About the data and methodology</Link>
        <MadeBy />
      </footer>
      <aside>
        <BoroughTotals meta={meta} snap={snap} onBorough={b => setBorough(filters.borough === b ? null : b)} />
        <NeighborhoodPanel meta={meta} snap={snap} neighborhoods={neighborhoods} onPickMonth={i => { const L = e - s; setRange(Math.max(0, i - L), Math.max(i, L)); }} />
        <NeighborhoodRanking snap={snap} neighborhoods={neighborhoods} onSelect={nta => update({ selected: nta })} />
      </aside>
      <TimeBar meta={meta} filters={filters} s={s} e={e} onRange={setRange} />
    </div>
  );
}
