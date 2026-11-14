import { getStore } from '../lib/store.js';
import { respond } from '../lib/respond.js';

export function GET() {
  return respond(() => getStore().neighborhoods());
}
