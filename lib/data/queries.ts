import type { BuildType, FilterContext, Filters } from '../filters';
import type { ChoroplethResponse, Meta, NeighborhoodInfo, ProjectProps, ProjectsResponse, SeriesResponse } from '../types';
import { getStore, type Kind, type RawSeries, type SeriesKey } from './store';

// The filter queries the API serves. Today they run in memory over the JSON store; with a database
// each becomes a query (a GROUP BY over monthly counts, a filtered SELECT of projects), and the
// response shapes stay the same.

type Key = SeriesKey | 'tj' | 'tu' | 'ta'; // t = completed including estimates (actual c + expected x)
// Composite t keys come after the c and x keys they're built from.
const KEYS: Key[] = ['pj', 'pu', 'pa', 'cj', 'cu', 'ca', 'xj', 'xu', 'xa', 'tj', 'tu', 'ta', 'ij', 'iu', 'ia'];
const MEASURE_KEY = { units: 'u', affordable: 'a', buildings: 'j' } as const;

// Units (all or affordable) use fixed thresholds so a color means the same count in every view.
// Building counts are much smaller, so they get data-driven breaks instead.
const UNIT_BREAKS = [50, 100, 150, 300, 500, 1000];

interface Series {
  cur: Record<string, Record<Key, number[]>>; // monthly values per NTA
  cum: Record<string, Record<Key, number[]>>; // prefix sums: cum[k][i] = total of months < i
}

interface Index {
  meta: Meta;
  ctx: FilterContext;
  neighborhoods: NeighborhoodInfo[];
  ntas: string[]; // every NTA with any data
  byType: Record<BuildType, Series>; // 'new' = new buildings; 'all' = plus alterations that add units
  historicByType: Record<BuildType, Series>; // the same, only jobs inside LPC historic protections
  acres: Record<string, [number, number]>;
  acresBoro: Record<string, string>; // ntaBoro only covers NTAs with data; this covers parks too // every NTA, parks included: [land, under historic protection]
  projects: { lon: number; lat: number; nta: string; boro: string; p: number; c: number; x: number; e: number; props: ProjectProps }[];
}

let index: Promise<Index> | undefined;
function getIndex(): Promise<Index> {
  index ??= buildIndex();
  index.catch(() => { index = undefined; });
  return index;
}

async function buildIndex(): Promise<Index> {
  const store = getStore();
  const [meta, series, geo, raw] = await Promise.all([store.meta(), store.series(), store.neighborhoods(), store.projects()]);
  const N = meta.months.length;

  const byType: Index['byType'] = { new: buildSeries(series, ['n'], N), all: buildSeries(series, ['n', 'a'], N) };
  const historicByType: Index['historicByType'] = { new: buildSeries(series, ['nh'], N), all: buildSeries(series, ['nh', 'ah'], N) };

  const neighborhoods: NeighborhoodInfo[] = geo.features
    .map(f => f.properties as unknown as NeighborhoodInfo)
    .filter(p => series[p.nta]?.n || series[p.nta]?.a)
    .map(({ nta, name, boro }) => ({ nta, name, boro }))
    .sort((a, b) => a.boro.localeCompare(b.boro) || a.name.localeCompare(b.name));
  const ntaBoro = Object.fromEntries(neighborhoods.map(n => [n.nta, n.boro]));
  const acres: Index['acres'] = {};
  const acresBoro: Record<string, string> = {};
  for (const { properties: p } of geo.features) {
    acres[p.nta as string] = [p.acres as number, p.hist_acres as number];
    acresBoro[p.nta as string] = p.boro as string;
  }

  // Open on the last 12 months of actual (not estimated) completions; completed is the default stage.
  const last = meta.months.indexOf(meta.projectedFrom) - 1;
  const ctx: FilterContext = { months: meta.months, boroughs: meta.boros, ntaBoro, defaultFrom: meta.months[last - 11], defaultTo: meta.months[last] };

  const never = raw.never;
  const orNull = (v: number) => (v === never ? null : v);
  const projects = raw.rows.map(([lon, lat, u, p, c, e, b, a, fl, ty, nta, x, xl, xh, aff]) => ({
    lon, lat, nta, boro: raw.boros[b], p, c, x, e,
    props: { u, aff, ty, a, alt: fl.includes('a'), dob: fl.includes('d'), h: fl.includes('h'), p, c: orNull(c), xl: orNull(xl), xh: orNull(xh), est: c === never } as ProjectProps,
  }));

  return { meta, ctx, neighborhoods, ntas: Object.keys(series), byType, historicByType, acres, acresBoro, projects };
}

// Sums the given job kinds into monthly arrays per NTA, plus prefix sums.
function buildSeries(series: RawSeries, kinds: Kind[], N: number): Series {
  const cur: Series['cur'] = {}, cum: Series['cum'] = {};
  for (const nta in series) {
    if (!kinds.some(k => series[nta][k])) continue;
    const c = {} as Record<Key, number[]>, s = {} as Record<Key, number[]>;
    for (const k of KEYS) {
      let a: number[];
      if (k[0] === 't') a = c[('c' + k[1]) as Key].map((v, i) => v + c[('x' + k[1]) as Key][i]);
      else {
        a = new Array(N).fill(0);
        for (const kind of kinds) series[nta][kind]?.[k as SeriesKey]?.forEach((v, i) => (a[i] += v));
      }
      c[k] = a;
      const p = new Array(N + 1); p[0] = 0;
      for (let i = 0; i < N; i++) p[i + 1] = p[i] + a[i];
      s[k] = p;
    }
    cur[nta] = c; cum[nta] = s;
  }
  return { cur, cum };
}

export async function getContext() {
  const ix = await getIndex();
  return { meta: ix.meta, ctx: ix.ctx, neighborhoods: ix.neighborhoods };
}

function view(ix: Index, f: Filters) {
  const s = ix.ctx.months.indexOf(f.from), e = ix.ctx.months.indexOf(f.to);
  const key = ((f.stage === 'completed' ? 't' : f.stage[0]) + MEASURE_KEY[f.measure]) as Key;
  const { cur, cum } = ix.byType[f.type];
  const valRange = (nta: string, a: number, b: number) => (cum[nta] ? cum[nta][key][b + 1] - cum[nta][key][a] : 0);
  const hcum = ix.historicByType[f.type].cum;
  const histVal = (nta: string) => (hcum[nta] ? hcum[nta][key][e + 1] - hcum[nta][key][s] : 0);
  const picked = new Set(f.neighborhoods);
  const inView = (nta: string) => (!f.borough || ix.ctx.ntaBoro[nta] === f.borough) && (!picked.size || picked.has(nta));
  return { s, e, key, cur, valRange, val: (nta: string) => valRange(nta, s, e), histVal, picked, inView };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function choropleth(f: Filters): Promise<ChoroplethResponse> {
  const ix = await getIndex();
  const v = view(ix, f);
  const values: Record<string, number> = {};
  for (const nta of ix.ntas) values[nta] = round1(v.val(nta));

  // A borough filter only dims the other boroughs; a neighborhood selection restricts the totals.
  const totals: Record<string, number> = Object.fromEntries(ix.meta.boros.map(b => [b, 0]));
  const historicTotals: Record<string, number> = { ...totals };
  for (const nta of ix.ntas) {
    const b = ix.ctx.ntaBoro[nta];
    if (b in totals && (!v.picked.size || v.picked.has(nta))) { totals[b] += v.val(nta); historicTotals[b] += v.histVal(nta); }
  }
  const sum = (r: Record<string, number>) => round1(Object.values(r).reduce((a, b) => a + b, 0));
  const total = sum(totals), historicTotal = sum(historicTotals);
  for (const b in totals) { totals[b] = round1(totals[b]); historicTotals[b] = round1(historicTotals[b]); }

  return {
    values, breaks: f.measure === 'buildings' ? buildingBreaks(ix, v) : UNIT_BREAKS, totals, total,
    historic: { totals: historicTotals, total: historicTotal, ...landShares(ix, v.picked) },
  };
}

// Share of land under historic protection, by borough and for the whole view (the picked
// neighborhoods if any, else the city). Doesn't depend on dates or measure.
function landShares(ix: Index, picked: Set<string>) {
  const land: Record<string, [number, number]> = Object.fromEntries(ix.meta.boros.map(b => [b, [0, 0]]));
  const all: [number, number] = [0, 0];
  for (const nta in ix.acres) {
    if (picked.size && !picked.has(nta)) continue;
    const [a, h] = ix.acres[nta];
    const b = land[ix.acresBoro[nta]];
    if (b) { b[0] += a; b[1] += h; }
    all[0] += a; all[1] += h;
  }
  const share = ([a, h]: [number, number]) => (a ? Math.round((h / a) * 1000) / 10 : 0);
  return { landShares: Object.fromEntries(Object.entries(land).map(([b, x]) => [b, share(x)])), landShare: share(all) };
}

// Quantiles of the current view's nonzero neighborhood values.
function buildingBreaks(ix: Index, v: ReturnType<typeof view>): number[] {
  const vals: number[] = [];
  for (const nta of ix.ntas) if (v.inView(nta)) { const x = v.val(nta); if (x > 0) vals.push(x); }
  if (!vals.length) return [2, 3, 5, 10, 15, 20];
  vals.sort((a, b) => a - b);
  return niceBreaks(Array.from({ length: 6 }, (_, i) => vals[Math.floor((vals.length * (i + 1)) / 7)]));
}

// Snap raw breaks to round numbers (5, 10, 25, 50, 100, 250…) so the legend reads as clean ranges.
const NICE: number[] = [];
for (let d = 1; d <= 1e6; d *= 10) for (const m of [1, 1.5, 2, 2.5, 3, 5, 7.5]) if (m * d >= 2 && Number.isInteger(m * d)) NICE.push(m * d);
function niceBreaks(raw: number[]): number[] {
  const out: number[] = [];
  for (const r of raw) {
    let i = NICE.reduce((best, x, j) => (Math.abs(Math.log(x / r)) < Math.abs(Math.log(NICE[best] / r)) ? j : best), 0);
    while (out.length && NICE[i] <= out[out.length - 1]) i++;
    out.push(NICE[i]);
  }
  return out;
}

// The projects behind the current choropleth numbers. Unfinished projects are placed at a month
// drawn from their completion estimate (see the pipeline), so counts track the expected totals.
export async function projects(f: Filters): Promise<ProjectsResponse> {
  const ix = await getIndex();
  const { s, e, picked } = view(ix, f);
  const within = (m: number) => m >= s && m <= e;
  const features = [];
  for (const p of ix.projects) {
    if (f.borough && p.boro !== f.borough) continue;
    if (picked.size && !picked.has(p.nta)) continue;
    if (f.type === 'new' && p.props.alt) continue;
    if (f.measure === 'affordable' && !p.props.aff) continue; // only projects with affordable units
    const hit = f.stage === 'permitted' ? within(p.p) : within(p.c) || (p.props.est && within(p.x));
    if (hit) features.push({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] }, properties: p.props });
  }
  return { type: 'FeatureCollection', features };
}

// Monthly history for the clicked neighborhood, or the picked neighborhoods combined.
export async function series(f: Filters): Promise<SeriesResponse> {
  const ix = await getIndex();
  const v = view(ix, f);
  const list = f.selected ? [f.selected] : f.neighborhoods;
  const N = ix.ctx.months.length;
  const m = MEASURE_KEY[f.measure];
  const actualKey = (f.stage === 'completed' ? 'c' : f.stage[0]) + m;
  const actual = new Array(N).fill(0), estimated = new Array(N).fill(0);
  for (const nta of list) {
    v.cur[nta]?.[actualKey as Key].forEach((x, i) => (actual[i] += x));
    if (f.stage === 'completed') v.cur[nta]?.[('x' + m) as Key].forEach((x, i) => (estimated[i] += x));
  }
  const total = list.reduce((a, nta) => a + v.val(nta), 0);
  return { neighborhoods: list, actual: actual.map(round1), estimated: estimated.map(round1), total: round1(total) };
}
