'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { BuildType, Filters, Measure, Stage } from '@/lib/filters';
import type { NeighborhoodInfo } from '@/lib/types';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string?][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <button key={v} aria-pressed={value === v} title={title} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function CopyLink({ shareUrl }: { shareUrl: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${location.origin}${location.pathname}${shareUrl}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt('Copy this link:', url); return; }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return <button className={`share${done ? ' done' : ''}`} title="Copy a link to this view" onClick={copy}>{done ? 'Copied!' : 'Copy link'}</button>;
}

function NeighborhoodPicker({ neighborhoods, borough, selected, onChange }: { neighborhoods: NeighborhoodInfo[]; borough: string | null; selected: string[]; onChange: (ntas: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const picked = new Set(selected);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onClick = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = neighborhoods.filter(n => (!borough || n.boro === borough) && (!q || n.name.toLowerCase().includes(q)));
  const byName = new Map(neighborhoods.map(n => [n.nta, n.name]));
  const label = !selected.length ? 'All neighborhoods' : selected.length === 1 ? byName.get(selected[0]) : `${selected.length} neighborhoods`;

  return (
    <div className="ms" ref={root}>
      <button className="ms-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && (
        <div className="ms-panel">
          <div className="ms-head">
            <input ref={search} type="search" placeholder="Search neighborhoods" aria-label="Search neighborhoods" value={query} onChange={e => setQuery(e.target.value)} />
            <button onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="ms-list">
            {!visible.length && <div className="muted" style={{ padding: '8px 10px' }}>No matches</div>}
            {visible.map((n, i) => (
              <div key={n.nta}>
                {(i === 0 || visible[i - 1].boro !== n.boro) && <div className="grp">{n.boro}</div>}
                <label>
                  <input type="checkbox" checked={picked.has(n.nta)} onChange={e => onChange(e.target.checked ? [...selected, n.nta] : selected.filter(x => x !== n.nta))} />
                  {n.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Controls({ filters, boroughs, neighborhoods, shareUrl, onChange, onBorough }: {
  filters: Filters;
  boroughs: string[];
  neighborhoods: NeighborhoodInfo[];
  shareUrl: string;
  onChange: (patch: Partial<Filters>) => void;
  onBorough: (b: string | null) => void;
}) {
  // On phones the controls collapse behind a Filters button (CSS shows them inline on wider screens).
  const [open, setOpen] = useState(false);
  const pickedCount = filters.neighborhoods.length;
  const summary = [
    { units: 'Units', affordable: 'Affordable', buildings: 'Buildings' }[filters.measure],
    filters.stage === 'completed' ? 'Completed' : 'Permitted',
    filters.type === 'all' ? '+ alterations' : null,
    pickedCount ? `${pickedCount} neighborhood${pickedCount > 1 ? 's' : ''}` : filters.borough,
  ].filter(Boolean).join(' · ');
  return (
    <header>
      <h1>NYC Housing Map</h1>
      <button className="filters-btn" aria-expanded={open} aria-controls="controls" onClick={() => setOpen(!open)}>
        <span className="filters-label">Filters</span> <span className="filters-summary">{summary}</span> {open ? '▴' : '▾'}
      </button>
      <div id="controls" className={`controls${open ? ' open' : ''}`}>
        <Segmented<Measure> label="Measure" value={filters.measure} options={[['units', 'Units'], ['affordable', 'Affordable units', 'Income-restricted units HPD tracks (from 2014)'], ['buildings', 'Buildings']]} onChange={measure => onChange({ measure })} />
        <Segmented<Stage> label="Stage" value={filters.stage} options={[['completed', 'Completed'], ['permitted', 'Permitted']]} onChange={stage => onChange({ stage })} />
        <Segmented<BuildType>
          label="Project type"
          value={filters.type}
          options={[
            ['new', 'New buildings', 'Only newly constructed buildings'],
            ['all', 'Include alterations', 'Also count renovations that add homes: conversions, added units and enlargements'],
          ]}
          onChange={type => onChange({ type })}
        />
        <label>
          Borough{' '}
          <select value={filters.borough ?? ''} onChange={e => onBorough(e.target.value || null)}>
            <option value="">All boroughs</option>
            {boroughs.map(b => <option key={b}>{b}</option>)}
          </select>
        </label>
        {/* The side panel follows the dropdown selection, so picking neighborhoods clears a map click. */}
        <NeighborhoodPicker neighborhoods={neighborhoods} borough={filters.borough} selected={filters.neighborhoods} onChange={ntas => onChange({ neighborhoods: ntas, selected: null })} />
        <button className="share filters-done" onClick={() => setOpen(false)}>Done</button>
      </div>
      <CopyLink shareUrl={shareUrl} />
      <Link className="share about-link" href="/about">About</Link>
    </header>
  );
}
