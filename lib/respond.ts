// The data only changes when the pipeline runs and the site redeploys (a deploy clears Vercel's
// CDN cache), so the CDN can hold responses for a day; browsers recheck after five minutes.
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

export async function respond(load: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await load(), { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to load data' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
