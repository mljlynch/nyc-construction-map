// Filters are the single description of a view. The page URL, the server-rendered page and every
// API route read and write them through this module, so a shared link and an API call always mean
// the same thing.

export type Measure = 'units' | 'buildings';
export type Stage = 'completed' | 'permitted';

export interface Filters {
  measure: Measure;
  stage: Stage;
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  borough: string | null;
  neighborhoods: string[]; // 2020 NTA codes
  selected: string | null; // NTA clicked on the map
}

// What a filter value is checked against. Built from the data on the server and from the page's
// props on the client.
export interface FilterContext {
  months: string[];
  boroughs: string[];
  ntaBoro: Record<string, string>; // NTA code -> borough, for NTAs that have data
  defaultFrom: string;
  defaultTo: string;
}

export const STAGES: Stage[] = ['completed', 'permitted'];

export function defaultFilters(ctx: FilterContext): Filters {
  return { measure: 'units', stage: 'completed', from: ctx.defaultFrom, to: ctx.defaultTo, borough: null, neighborhoods: [], selected: null };
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;
function getter(src: ParamSource) {
  if (src instanceof URLSearchParams) return (k: string) => src.get(k);
  return (k: string) => {
    const v = src[k];
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
  };
}

// Anything unrecognized falls back to the default rather than erroring, so a mistyped shared link
// still opens.
export function parseFilters(src: ParamSource, ctx: FilterContext): Filters {
  const get = getter(src);
  const f = defaultFilters(ctx);
  if (get('measure') === 'buildings') f.measure = 'buildings';
  const stage = get('stage');
  if (stage && (STAGES as string[]).includes(stage)) f.stage = stage as Stage;

  const idx = (m: string | null) => (m ? ctx.months.indexOf(m) : -1);
  const di = idx(ctx.defaultFrom), dj = idx(ctx.defaultTo);
  let s = di, e = dj;
  const to = idx(get('to')), from = idx(get('from'));
  if (to >= 0) e = to;
  if (from >= 0) s = from;
  else if (to >= 0) s = Math.max(0, to - (dj - di)); // keep the default window length
  if (s > e) [s, e] = [e, s];
  f.from = ctx.months[s];
  f.to = ctx.months[e];

  const borough = get('borough');
  if (borough && ctx.boroughs.includes(borough)) f.borough = borough;
  const ntas = (get('neighborhoods') ?? '').split(',').filter(n => ctx.ntaBoro[n] && (!f.borough || ctx.ntaBoro[n] === f.borough));
  f.neighborhoods = [...new Set(ntas)];
  const selected = get('selected');
  if (selected && ctx.ntaBoro[selected]) f.selected = selected;
  return f;
}

// `full` writes every field (for API calls, so each distinct view has one cache key); otherwise
// defaults are left out to keep page links short.
export function toSearchParams(f: Filters, ctx: FilterContext, full = false): URLSearchParams {
  const q = new URLSearchParams();
  const rangeChanged = f.from !== ctx.defaultFrom || f.to !== ctx.defaultTo;
  if (full || f.measure !== 'units') q.set('measure', f.measure);
  if (full || f.stage !== 'completed') q.set('stage', f.stage);
  if (full || rangeChanged) { q.set('from', f.from); q.set('to', f.to); }
  if (f.borough) q.set('borough', f.borough);
  if (f.neighborhoods.length) q.set('neighborhoods', [...f.neighborhoods].sort().join(','));
  if (f.selected) q.set('selected', f.selected);
  return q;
}

export function queryString(q: URLSearchParams): string {
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

export function isNarrowed(f: Filters): boolean {
  return !!(f.borough || f.neighborhoods.length);
}
