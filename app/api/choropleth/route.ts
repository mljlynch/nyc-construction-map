// Per-neighborhood values, color breaks and borough totals for the filters in the query string.
import { choropleth } from '@/lib/data/queries';
import { filteredRoute } from '@/lib/data/route';

export const GET = filteredRoute(choropleth);
