'use client';

import { fmt, monthLabel, rangeText, whatText } from '@/lib/format';
import type { Meta } from '@/lib/types';
import type { Snapshot } from './HousingMap';
import { pastData, projectedIn } from './MapView';

export function BoroughTotals({ meta, snap, onBorough }: { meta: Meta; snap: Snapshot | null; onBorough: (b: string) => void }) {
  if (!snap) return <h2>Borough totals</h2>;
  const f = snap.filters;
  const { totals, total, historic } = snap.choropleth;
  // Follows the borough filter, since the borough rows above only dim.
  const hist = f.borough ? historic.totals[f.borough] ?? 0 : historic.total;
  const histOf = f.borough ? totals[f.borough] ?? 0 : total;
  const max = Math.max(1, ...Object.values(totals));
  const n = f.neighborhoods.length;
  const scope = n ? ` · ${n} selected neighborhood${n > 1 ? 's' : ''}` : '';
  const lastActual = meta.months[meta.months.indexOf(meta.projectedFrom) - 1];
  const caveat = projectedIn(meta, f) ? ` · includes estimates after ${monthLabel(lastActual)}` : pastData(meta, f) ? ` · no permit data after ${monthLabel(meta.dataEnd)}` : '';
  return (
    <>
      <h2>Borough totals · {rangeText(f)}</h2>
      <div className="muted" style={{ marginBottom: 6 }}>{whatText(f)}{scope}{caveat}</div>
      {/* A borough filter only dims the other rows; clicking a row toggles that borough. */}
      {meta.boros.map(b => (
        <div key={b} className={`boro${f.borough && f.borough !== b ? ' dim' : ''}`} onClick={() => onBorough(b)}>
          <span>{b}</span>
          <div className="bar" style={{ width: `${((totals[b] ?? 0) / max) * 100}%` }} />
          <span className="v">{fmt(totals[b] ?? 0)}</span>
        </div>
      ))}
      <div className="total"><span>{n ? 'Selected total' : 'New York City'}</span><span>{fmt(total)}</span></div>
      <div className="hist-total" title="Inside a historic district or on an individual landmark site designated by the Landmarks Preservation Commission">
        <span><span className="overlay-sw" /> In historic protections{f.borough && !n ? ` · ${f.borough}` : ''}</span>
        <span>{fmt(hist)}{histOf > 0 && <span className="muted"> · {Math.round((hist / histOf) * 1000) / 10}%</span>}</span>
      </div>
    </>
  );
}
