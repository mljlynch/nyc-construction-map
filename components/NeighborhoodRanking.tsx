'use client';

import { useState } from 'react';
import { fmt, rangeText, whatText } from '@/lib/format';
import type { NeighborhoodInfo } from '@/lib/types';
import type { Snapshot } from './HousingMap';

const COLLAPSED = 10;

// Neighborhoods in the current borough/neighborhood filter, ranked by the current measure. Uses the
// same per-neighborhood values the map is colored by, so the two always agree.
export function NeighborhoodRanking({ snap, neighborhoods, onSelect }: { snap: Snapshot | null; neighborhoods: NeighborhoodInfo[]; onSelect: (nta: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!snap) return <h2>Neighborhoods</h2>;
  const f = snap.filters;
  const picked = new Set(f.neighborhoods);
  const rows = neighborhoods
    .filter(n => (!f.borough || n.boro === f.borough) && (!picked.size || picked.has(n.nta)))
    .map(n => ({ ...n, v: snap.choropleth.values[n.nta] ?? 0 }))
    .filter(n => n.v > 0)
    .sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);
  const max = Math.max(1, rows[0]?.v ?? 0);
  const scope = picked.size ? 'selected neighborhoods' : f.borough ?? 'all of NYC';

  return (
    <>
      <h2>Neighborhoods · {rangeText(f)}</h2>
      <div className="muted" style={{ marginBottom: 6 }}>{whatText(f)} · {scope}</div>
      {!rows.length && <div className="muted">None in this view.</div>}
      <ol className="rank">
        {shown.map((n, i) => (
          <li key={n.nta} className={n.nta === f.selected ? 'sel' : ''}>
            <button onClick={() => onSelect(n.nta)} title={`${n.name}, ${n.boro}`}>
              <span className="rk">{i + 1}</span>
              <span className="nm">{n.name}{!f.borough && <span className="muted"> · {n.boro}</span>}</span>
              <span className="v">{fmt(n.v)}</span>
              <span className="bar" style={{ width: `${(n.v / max) * 100}%` }} />
            </button>
          </li>
        ))}
      </ol>
      {rows.length > COLLAPSED && (
        <button className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show top 10' : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}
