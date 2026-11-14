import { getStore } from '@/lib/data/store';
import { staticRoute } from '@/lib/data/route';

export const GET = staticRoute(() => getStore().meta());
