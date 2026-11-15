'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { FilterContext, Filters } from '@/lib/filters';
import { capitalize, fmt, monthLabel, rangeText, whatText } from '@/lib/format';
import type { Meta, ProjectProps } from '@/lib/types';
import type { Snapshot } from './HousingMap';

const SWATCHES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7'];
const NTA_OPACITY: ExpressionSpecification = ['case', ['boolean', ['feature-state', 'dim'], false], 0.15, 0.92];
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Circle area tracks unit count (radius ~ sqrt(units)); a floor keeps 1-2 unit homes visible.
const R_SCALE = 0.36;
const radiusAt = (units: number, zoom: number) =>
  Math.max(2, R_SCALE * Math.sqrt(Math.max(units, 1)) * (zoom >= 14 ? 2.4 : zoom <= 10 ? 0.7 : 0.7 + (zoom - 10) * 0.425));
// Sized by total units, or by affordable units in the affordable view.
function radiusExpr(field: 'u' | 'aff' = 'u'): ExpressionSpecification {
  const at = (k: number): ExpressionSpecification => ['max', 2, ['*', R_SCALE * k, ['sqrt', ['max', ['get', field], 1]]]];
  return ['interpolate', ['linear'], ['zoom'], 10, at(0.7), 14, at(2.4)];
}

const classOf = (v: number, breaks: number[]) => (v <= 0 ? 0 : 1 + breaks.filter(b => v >= b).length);

export const projectedIn = (meta: Meta, f: Filters) => f.stage === 'completed' && f.to >= meta.projectedFrom;
export const pastData = (meta: Meta, f: Filters) => f.stage === 'permitted' && f.to > meta.dataEnd;

// On phones the legend starts collapsed (it would cover half the map); tapping the title toggles it.
function Legend({ meta, snap, zoom }: { meta: Meta; snap: Snapshot; zoom: number }) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && matchMedia('(max-width: 820px)').matches);
  const f = snap.filters;
  const lows = [1, ...snap.choropleth.breaks];
  if (collapsed) {
    return (
      <button className="legend legend-mini" onClick={() => setCollapsed(false)} aria-label="Show legend">
        <span className="title">{capitalize(whatText(f))}</span>
        <span className="mini-scale">
          {SWATCHES.map(v => <span key={v} style={{ background: `var(${v})` }} />)}
        </span>
        <span className="mini-ends"><span>1</span><span>{fmt(lows[lows.length - 1])}+</span></span>
      </button>
    );
  }
  return (
    <div className="legend">
      <button className="title legend-toggle" onClick={() => setCollapsed(true)} aria-label="Collapse legend">
        {capitalize(whatText(f))}, {rangeText(f)} <span className="legend-x">▾</span>
      </button>
      <div className="lrows">
        {SWATCHES.map((v, i) => {
          const lo = lows[i], hi = lows[i + 1] - 1;
          const range = i === lows.length - 1 ? `${fmt(lo)}+` : lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
          return <div className="lrow" key={v}><span className="lsw" style={{ background: `var(${v})` }} />{range}</div>;
        }).reverse()}
        <div className="lrow"><span className="lsw zero" />None</div>
      </div>
      {projectedIn(meta, f) && <div className="lnote">Includes estimated completions{f.stage === 'completed' ? '; faded markers are estimates' : ''}</div>}
      <div className="sizes">
        <span>{f.measure === 'affordable' ? 'Affordable units' : 'Project units'}</span>
        {[10, 100, 500].map(u => { const d = 2 * radiusAt(u, zoom); return <div key={u}><span className="dot" style={{ width: d, height: d }} />{u}</div>; })}
      </div>
    </div>
  );
}

export function MapView({ meta, ctx, snap, error, fitKey, filters, onSelect }: {
  meta: Meta;
  ctx: FilterContext;
  snap: Snapshot | null;
  error: boolean;
  fitKey: string; // changes when the borough/neighborhood selection changes; '' = whole city
  filters: Filters;
  onSelect: (nta: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(9.6);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  // Map event handlers are registered once, so they read the latest props through this ref.
  const latest = useRef({ snap, onSelect });
  latest.current = { snap, onSelect };

  useEffect(() => {
    fetch('/api/neighborhoods').then(r => r.json()).then(setGeo).catch(console.error);
  }, []);

  useEffect(() => {
    let map: MlMap | undefined, cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: matchMedia('(prefers-color-scheme: dark)').matches
          ? 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
          : 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
        center: [-73.94, 40.7], zoom: 9.6, attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => setLoaded(true));
      map.on('zoomend', () => setZoom(map!.getZoom()));
      mapRef.current = map;
    })();
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
  }, []);

  // Layers go in once both the basemap and the boundaries are loaded. Both data layers start
  // transparent and appear together on the first render below.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !geo || map.getSource('nta')) return;
    const fill = ['--zero', ...SWATCHES].map(css);
    map.addSource('nta', { type: 'geojson', data: geo, promoteId: 'nta' });
    map.addLayer({ id: 'nta-fill', type: 'fill', source: 'nta', paint: {
      'fill-color': ['match', ['coalesce', ['feature-state', 'c'], 0], 0, fill[0], 1, fill[1], 2, fill[2], 3, fill[3], 4, fill[4], 5, fill[5], 6, fill[6], fill[7]],
      'fill-opacity': 0 } });
    map.addLayer({ id: 'nta-line', type: 'line', source: 'nta', paint: { 'line-color': css('--outline'), 'line-width': 0.6 } });
    map.addLayer({ id: 'nta-sel', type: 'line', source: 'nta', paint: { 'line-color': css('--text-primary'), 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.5, 0] } });
    map.addSource('proj', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'proj', type: 'circle', source: 'proj', paint: {
      'circle-radius': radiusExpr(), 'circle-color': css('--marker'), 'circle-opacity': 0,
      'circle-stroke-color': css('--outline'), 'circle-stroke-width': 1 } });

    const N = meta.months.length;
    const when = (i: number | null) => (i === null ? null : i < 0 ? 'before 2010' : i < N ? monthLabel(meta.months[i]) : `after ${monthLabel(meta.months[N - 1])}`);
    // One handler so a project under the cursor wins over the neighborhood beneath it. It also runs
    // on click, because phones have no hover: a tap shows the same details.
    const showDetails = (e: maplibregl.MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['proj', 'nta-fill'] });
      const pr = hit.find(f => f.layer.id === 'proj'), n = hit.find(f => f.layer.id === 'nta-fill');
      map.getCanvas().style.cursor = pr || n ? 'pointer' : '';
      const { x, y } = e.originalEvent;
      const snapNow = latest.current.snap;
      if (pr) {
        // MapLibre drops null properties from rendered features, so missing dates arrive as undefined.
        const p = pr.properties as ProjectProps;
        setTip({ x, y, body: (
          <>
            <div style={{ fontWeight: 600 }}>{p.a || 'Address unknown'}</div>
            <b>{fmt(p.u)}</b> units{p.aff > 0 && <> · <b>{fmt(p.aff)}</b> affordable</>} · {p.alt ? 'alteration' : 'new building'}
            <br /><span className="muted">
              {meta.buildingTypes[p.ty]}
              <br />Permitted {when(p.p) ?? '—'}{p.c != null && ` · completed ${when(p.c)}`}
              {p.est && p.xl != null && <><br />Est. completion likely {when(p.xl)}{p.xh != null && p.xh > p.xl && ` – ${when(p.xh)}`}</>}
              {p.dob && <><br />DOB NOW filing (provisional)</>}
            </span>
          </>
        ) });
      } else if (n && snapNow) {
        const p = n.properties as { nta: string; name: string; boro: string };
        setTip({ x, y, body: (
          <>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <span className="muted">{p.boro}</span>
            <br /><b>{fmt(snapNow.choropleth.values[p.nta] ?? 0)}</b> {whatText(snapNow.filters)}
          </>
        ) });
      } else setTip(null);
    };
    map.on('mousemove', showDetails);
    map.on('click', showDetails);
    map.on('movestart', () => setTip(null));
    map.on('mouseout', () => setTip(null));
    map.on('click', 'nta-fill', e => {
      const nta = e.features?.[0]?.properties?.nta;
      if (nta) latest.current.onSelect(nta);
    });
  }, [loaded, geo, meta]);

  // Apply a snapshot. New markers are laid out in a worker and show up a beat later, while
  // feature-state colors apply on the next frame, so the markers go first and the colors (and
  // marker opacity) wait for the map to go idle. That way both change together.
  const seq = useRef(0);
  const readyRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snap || !geo || !map.getSource('nta')) return;
    const mine = ++seq.current;
    (map.getSource('proj') as GeoJSONSource).setData(snap.projects as GeoJSON.FeatureCollection);
    map.once('idle', () => {
      if (mine !== seq.current) return; // superseded by a newer snapshot
      const f = snap.filters;
      const picked = new Set(f.neighborhoods);
      map.setPaintProperty('proj', 'circle-opacity', f.stage === 'completed' ? ['case', ['get', 'est'], 0.3, 0.75] : 0.7);
      map.setPaintProperty('proj', 'circle-radius', radiusExpr(f.measure === 'affordable' ? 'aff' : 'u'));
      for (const feat of geo.features) {
        const nta = feat.properties!.nta as string;
        const inView = (!f.borough || ctx.ntaBoro[nta] === f.borough) && (!picked.size || picked.has(nta));
        map.setFeatureState({ source: 'nta', id: nta }, { c: classOf(snap.choropleth.values[nta] ?? 0, snap.choropleth.breaks), dim: !inView, sel: nta === f.selected });
      }
      if (!readyRef.current) {
        map.setPaintProperty('nta-fill', 'fill-opacity', NTA_OPACITY);
        readyRef.current = true;
        setReady(true);
      }
    });
    map.triggerRepaint(); // guarantees an idle event even when nothing else changed
  }, [snap, geo, loaded, ctx]);

  // Zoom to the borough/neighborhood selection when it changes (and to a shared link's selection on
  // load). Clearing it zooms back out to the whole city.
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !geo || lastFit.current === fitKey) return;
    const first = lastFit.current === null;
    lastFit.current = fitKey;
    if (first && !fitKey) return;
    const picked = new Set(filters.neighborhoods);
    const bb = [180, 90, -180, -90];
    const walk = (c: unknown): void => {
      if (typeof (c as number[])[0] === 'number') {
        const [x, y] = c as number[];
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y);
      } else (c as unknown[]).forEach(walk);
    };
    for (const feat of geo.features) {
      const nta = feat.properties!.nta as string;
      if ((!filters.borough || ctx.ntaBoro[nta] === filters.borough) && (!picked.size || picked.has(nta))) walk((feat.geometry as GeoJSON.Polygon).coordinates);
    }
    if (bb[0] < bb[2]) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30, duration: first ? 0 : 600 });
  }, [fitKey, loaded, geo, filters, ctx]);

  return (
    <div className={`map${ready ? ' ready' : ''}`}>
      <div ref={container} className="map-canvas" />
      {snap && <Legend meta={meta} snap={snap} zoom={zoom} />}
      {error && <div className="map-error"><p>Couldn&apos;t load the map data. Please refresh to try again.</p></div>}
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 12, window.innerWidth - 300), top: tip.y + 12 }}>{tip.body}</div>}
    </div>
  );
}
