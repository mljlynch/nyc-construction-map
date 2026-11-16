'use client';

import type { Filters } from '@/lib/filters';
import { monthLabel } from '@/lib/format';
import type { Meta } from '@/lib/types';
import { pastData, projectedIn } from './MapView';

function MonthSelect({ meta, label, value, min, max, onChange }: { meta: Meta; label: string; value: number; min: number; max: number; onChange: (i: number) => void }) {
  const years = new Map<string, number[]>();
  meta.months.forEach((m, i) => {
    const y = m.slice(0, 4);
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(i);
  });
  return (
    <select className="month-select" aria-label={label} value={value} onChange={ev => onChange(+ev.target.value)}>
      {[...years].map(([y, idx]) => (
        <optgroup key={y} label={y}>
          {idx.map(i => (
            <option key={i} value={i} disabled={i < min || i > max}>
              {monthLabel(meta.months[i])}{meta.months[i] >= meta.projectedFrom ? ' (est.)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Start and end month pickers plus a two-handle range slider. The notes sit on their own line
// under the pickers (always rendered) so showing or hiding one never resizes the slider.
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
      <div className="range-pick">
        <div className="range-selects">
          <MonthSelect meta={meta} label="Start month" value={s} min={0} max={e} onChange={i => onRange(i, e)} />
          <span aria-hidden>–</span>
          <MonthSelect meta={meta} label="End month" value={e} min={s} max={N - 1} onChange={i => onRange(s, i)} />
        </div>
        <div className="range-notes">
          <span>{months} month{months > 1 ? 's' : ''}</span>
          {provisional && <span className="note">Provisional · DOB NOW</span>}
          {est && <span className="note est">{est}</span>}
        </div>
      </div>
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
    </div>
  );
}
