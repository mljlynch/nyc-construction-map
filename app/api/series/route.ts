// Monthly history for ?selected=, or for ?neighborhoods= combined.
import { series } from '@/lib/data/queries';
import { filteredRoute } from '@/lib/data/route';

export const GET = filteredRoute(series);
