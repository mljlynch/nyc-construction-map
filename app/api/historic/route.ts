import { getStore } from '@/lib/data/store';
import { staticRoute } from '@/lib/data/route';

// LPC historic districts and individual landmark sites (GeoJSON), for the map overlay.
export const GET = staticRoute(() => getStore().historic());
