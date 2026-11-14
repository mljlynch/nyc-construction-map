'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';

// Filter changes rewrite the URL; only the first pageview per load is sent so they don't count as
// extra visits. That first one keeps its query string, so shared links show up with their view.
let sent = false;
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') return event;
  if (sent) return null;
  sent = true;
  return event;
}

export function AnalyticsClient() {
  return <Analytics beforeSend={beforeSend} />;
}
