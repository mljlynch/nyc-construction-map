'use client';

import { useState } from 'react';
import type { Filters } from '@/lib/filters';
import { fmt, monthLabel, rangeText, whatText } from '@/lib/format';
import type { Meta, NeighborhoodInfo } from '@/lib/types';
import type { Snapshot } from './HousingMap';

// The clicked neighborhood, or the dropdown selection combined when nothing is clicked.
export function NeighborhoodPanel({ meta, snap, neighborhoods, onPickMonth }: { meta: Meta; snap: Snapshot | null; neighborhoods: NeighborhoodInfo[]; onPickMonth: (i: number) => void }) {
  const series = snap?.series;
  if (!snap || !series || !series.neighborhoods.length) {
    return (
      <>
        <h2>Neighborhood</h2>
        <div className="muted">Click a neighborhood on the map, or pick some from the Neighborhoods menu, to see monthly history.</div>
      </>
    );
  }
  const info = new Map(neighborhoods.map(n => [n.nta, n]));
  const list = series.neighborhoods.map(n => info.get(n)).filter((n): n is NeighborhoodInfo => !!n);
  return (
    <>
      <h2>Neighborhood</h2>
      {list.length === 1
        ? <><div style={{ fontWeight: 600 }}>{list[0].name}</div><div className="muted">{list[0].boro} · {list[0].nta}</div></>
        : <><div style={{ fontWeight: 600 }}>{list.length} neighborhoods combined</div><div className="muted">{list.map(n => n.name).join(', ')}</div></>}
      <div style={{ marginTop: 8 }}>
        <span className="hero">{fmt(series.total)}</span> <span className="muted">{whatText(snap.filters)} · {rangeText(snap.filters)}</span>
      </div>
      <TrendChart meta={meta} filters={snap.filters} actual={series.actual} estimated={series.estimated} onPickMonth={onPickMonth} />
    </>
  );
}

// Monthly bars (estimated completions stacked on top, faded), with the selected range shaded.
function TrendChart({ meta, filters: f, actual: s, estimated: sx, onPickMonth }: { meta: Meta; filters: Filters; actual: number[]; estimated: number[]; onPickMonth: (i: number) => void }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const W = 328, H = 170, m = { l: 36, r: 6, t: 10, b: 20 };
  const months = meta.months;
  const n = s.length, iw = W - m.l - m.r, ih = H - m.t - m.b, cw = iw / n;
  const tot = s.map((v, i) => v + sx[i]);
  const max = Math.max(1, ...tot);
  const p10 = 10 ** Math.floor(Math.log10(max));
  const nice = [1, 2, 2.5, 5, 10].map(k => k * p10).find(v => v >= max)!;
  const x = (i: number) => m.l + (i + 0.5) * cw, y = (v: number) => m.t + ih - (v / nice) * ih, bw = Math.max(1, cw - 0.6);
  const si = months.indexOf(f.from), ei = months.indexOf(f.to);
  const provIdx = meta.provisionalFrom ? months.indexOf(meta.provisionalFrom) : -1;
  const projIdx = months.indexOf(meta.projectedFrom);
  const inR = (i: number) => i >= si && i <= ei;
  const accent = { fill: 'var(--accent)' };

  const bar = (lo: number, hi: number, i: number, op: number, key: string) =>
    hi > lo ? <rect key={key} x={x(i) - bw / 2} y={y(hi)} width={bw} height={y(lo) - y(hi)} style={accent} opacity={op * (inR(i) ? 1 : 0.35)} /> : null;
  const marks = s.map((v, i) => [bar(0, v, i, 1, `a${i}`), bar(v, v + sx[i], i, 0.45, `e${i}`)]);

  const idxAt = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((((e.clientX - r.left) * W) / r.width - m.l) / cw)));
  };
  const hoverNote = (i: number) =>
    f.stage === 'completed' && sx[i] ? `${fmt(s[i])} actual + ${fmt(sx[i])} estimated`
      : f.stage === 'permitted' && provIdx >= 0 && i >= provIdx ? 'provisional' : null;

  const byYear: Record<string, number> = {};
  months.forEach((mo, i) => { const yr = mo.slice(0, 4); byYear[yr] = (byYear[yr] ?? 0) + tot[i]; });

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly ${whatText(f)}`}>
        {[0, nice / 2, nice].map(v => (
          <g key={v}>
            <g className="grid"><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} /></g>
            <g className="axis"><text x={m.l - 4} y={y(v) + 3} textAnchor="end">{v >= 1000 ? `${v / 1000}k` : v}</text></g>
          </g>
        ))}
        {provIdx >= 0 && f.stage === 'permitted' && <rect x={m.l + provIdx * cw} y={m.t} width={(n - provIdx) * cw} height={ih} style={{ fill: 'var(--provisional)' }} opacity={0.08} />}
        {f.stage === 'completed' && projIdx > 0 && (
          <>
            <rect x={m.l + projIdx * cw} y={m.t} width={(n - projIdx) * cw} height={ih} style={{ fill: 'var(--text-muted)' }} opacity={0.08} />
            <text x={W - m.r - 2} y={m.t + 10} textAnchor="end" fontSize={9} style={{ fill: 'var(--text-muted)' }}>estimated</text>
          </>
        )}
        <rect x={m.l + si * cw} y={m.t} width={(ei - si + 1) * cw} height={ih} style={accent} opacity={0.12} />
        {months.map((mo, i) => (mo.endsWith('-01') && +mo.slice(0, 4) % 4 === 2
          ? <g className="axis" key={mo}><text x={x(i)} y={H - 6} textAnchor="middle">{mo.slice(0, 4)}</text></g> : null))}
        {marks}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={m.t} y2={m.t + ih} style={{ stroke: 'var(--text-muted)' }} strokeWidth={1} />}
        {/* Clicking the chart moves the window to end at that month, keeping its length. */}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseMove={e => setHover({ i: idxAt(e), x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHover(null)}
          onClick={e => onPickMonth(idxAt(e))} />
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 12, window.innerWidth - 220), top: hover.y + 12 }}>
          {monthLabel(months[hover.i])}<br /><b>{fmt(tot[hover.i])}</b> {whatText(f)}
          {hoverNote(hover.i) && <><br /><span className="muted">{hoverNote(hover.i)}</span></>}
        </div>
      )}
      <details>
        <summary>Table view</summary>
        <table className="data">
          <thead><tr><th>Year</th><th>Total</th></tr></thead>
          <tbody>{Object.entries(byYear).map(([yr, v]) => <tr key={yr}><td>{yr}</td><td>{fmt(v)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
