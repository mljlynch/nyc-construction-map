'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isNarrowed, queryString, toSearchParams, type FilterContext, type Filters } from '@/lib/filters';
import type { ChoroplethResponse, Meta, NeighborhoodInfo, ProjectsResponse, SeriesResponse } from '@/lib/types';
import { BoroughTotals } from './BoroughTotals';
import { Controls } from './Controls';
import { MapView } from './MapView';
import { NeighborhoodPanel } from './NeighborhoodPanel';
import { Notes } from './Notes';
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
const PLAY_STEP = 140;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json() as Promise<T>;
}

export function HousingMap({ meta, ctx, neighborhoods, initialFilters }: { meta: Meta; ctx: FilterContext; neighborhoods: NeighborhoodInfo[]; initialFilters: Filters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
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
  useEffect(() => {
    const ctrl = new AbortController();
    const q = queryString(toSearchParams(filters, ctx, true));
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
    }, playing ? 0 : FETCH_DELAY);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [filters, ctx, playing]);

  // Keep the filters in the address bar (without adding history entries) so the view can be shared.
  const shareUrl = useMemo(() => queryString(toSearchParams(filters, ctx)), [filters, ctx]);
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(history.state, '', shareUrl || location.pathname), URL_DELAY);
    return () => clearTimeout(t);
  }, [shareUrl]);

  // Playback slides the window forward one month once the current month has rendered, so it never
  // outruns the data.
  useEffect(() => {
    if (!playing || !snap || snap.filters !== filters) return;
    if (e >= N - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setRange(s + 1, e + 1), PLAY_STEP);
    return () => clearTimeout(t);
  }, [playing, snap, filters, s, e, N, setRange]);

  const togglePlay = useCallback(() => {
    if (!playing && e >= N - 1) setRange(0, e - s); // restart from 2010 with the same window length
    setPlaying(!playing);
  }, [playing, e, s, N, setRange]);

  // Space plays/pauses; arrow keys slide the window.
  const keys = useRef({ s, e, togglePlay, setRange });
  keys.current = { s, e, togglePlay, setRange };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
      const k = keys.current;
      if (ev.key === ' ') { ev.preventDefault(); k.togglePlay(); }
      if (ev.key === 'ArrowRight' && k.e < N - 1) k.setRange(k.s + 1, k.e + 1);
      if (ev.key === 'ArrowLeft' && k.s > 0) k.setRange(k.s - 1, k.e - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [N]);

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
      <aside>
        <BoroughTotals meta={meta} snap={snap} onBorough={b => setBorough(filters.borough === b ? null : b)} />
        <NeighborhoodPanel meta={meta} snap={snap} neighborhoods={neighborhoods} onPickMonth={i => { const L = e - s; setRange(Math.max(0, i - L), Math.max(i, L)); }} />
        <Notes meta={meta} />
      </aside>
      <TimeBar meta={meta} filters={filters} s={s} e={e} playing={playing} onRange={setRange} onTogglePlay={togglePlay} />
    </div>
  );
}
