// GeoJSON of only the projects that match the filters (markers).
import { projects } from '@/lib/data/queries';
import { filteredRoute } from '@/lib/data/route';

export const GET = filteredRoute(projects);
