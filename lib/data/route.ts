import { parseFilters, type Filters } from '../filters';
import { getContext } from './queries';

// The data only changes when the pipeline runs and the site redeploys (which clears Vercel's CDN),
// so the CDN can hold each filtered response for a day; browsers recheck after five minutes.
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

export function json(data: unknown): Response {
  return Response.json(data, { headers: { 'Cache-Control': CACHE_CONTROL } });
}

function failure(err: unknown): Response {
  console.error(err);
  return Response.json({ error: 'Failed to load data' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

/** Wraps a route that takes no filters. */
export function staticRoute(load: () => Promise<unknown>) {
  return async () => {
    try { return json(await load()); } catch (err) { return failure(err); }
  };
}

/** Wraps a route whose response depends on the filters in the query string (same params as page links). */
export function filteredRoute(load: (f: Filters) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      const { ctx } = await getContext();
      return json(await load(parseFilters(new URL(request.url).searchParams, ctx)));
    } catch (err) {
      return failure(err);
    }
  };
}
