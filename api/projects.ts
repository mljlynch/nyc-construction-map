import { getStore } from '../lib/store';
import { respond } from '../lib/respond';

export function GET() {
  return respond(() => getStore().projects());
}
