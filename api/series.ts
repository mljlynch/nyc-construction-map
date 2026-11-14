import { getStore } from '../lib/store.js';
import { respond } from '../lib/respond.js';

export function GET() {
  return respond(() => getStore().series());
}

// HEAD gets the same headers (used by link checkers and uptime monitors).
export const HEAD = GET;
