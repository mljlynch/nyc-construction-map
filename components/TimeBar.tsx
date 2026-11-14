'use client';

import type { Filters } from '@/lib/filters';
import { monthLabel, rangeText } from '@/lib/format';
import type { Meta } from '@/lib/types';
import { pastData, projectedIn } from './MapView';

// Two-handle month range slider.
export function TimeBar({ meta, filters: f, s, e, onRange }: {
  meta: Meta;
  filters: Filters;
  s: number;
  e: number;
  onRange: (s: number, e: number) => void;
}) {
  const N = meta.months.length;
  const pct = (i: number) => (i / (N - 1)) * 100;
  const months = e - s + 1;
  const provisional = f.stage !== 'completed' && !!meta.provisionalFrom && f.to >= meta.provisionalFrom && f.to <= meta.dataEnd;
  const est = projectedIn(meta, f) ? 'Includes estimates' : pastData(meta, f) ? `No permit data after ${monthLabel(meta.dataEnd)}` : null;

  return (
    <div className="timebar">
      <span className="range-label">{rangeText(f)}{months > 1 ? ` · ${months} mo` : ''}</span>
      <div className="range">
        <div className="track">
          <div className="fill" style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }} />
        </div>
        {/* When the handles meet at the right end, the start handle must sit on top or it can't be dragged back. */}
        <input type="range" min={0} max={N - 1} value={s} aria-label="Start month" style={{ zIndex: s >= N - 2 ? 3 : 1 }}
          onChange={ev => onRange(Math.min(+ev.target.value, e), e)} />
        <input type="range" min={0} max={N - 1} value={e} aria-label="End month"
          onChange={ev => onRange(s, Math.max(+ev.target.value, s))} />
        <div className="years">
          {meta.months.map((mo, i) => (mo.endsWith('-01') && +mo.slice(0, 4) % 2 === 0 ? <span key={mo} style={{ left: `${pct(i)}%` }}>{mo.slice(0, 4)}</span> : null))}
        </div>
      </div>
      {provisional && <span className="badge">Provisional · DOB NOW</span>}
      {est && <span className="badge est">{est}</span>}
    </div>
  );
}
