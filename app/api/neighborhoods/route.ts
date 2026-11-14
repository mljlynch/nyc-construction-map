import { getStore } from '@/lib/data/store';
import { staticRoute } from '@/lib/data/route';

// NTA boundaries (GeoJSON). Static, so it isn't filtered; the map dims areas outside the filters.
export const GET = staticRoute(() => getStore().neighborhoods());
