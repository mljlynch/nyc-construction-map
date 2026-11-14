import type { Filters } from './filters';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const monthLabel = (m: string) => `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;

const MEASURE_TEXT = { units: 'units', affordable: 'affordable units', buildings: 'buildings' } as const;
export const whatText = (f: Filters) => `${MEASURE_TEXT[f.measure]} ${f.stage}`;

export function rangeText(f: Filters): string {
  return f.from === f.to ? monthLabel(f.to) : `${monthLabel(f.from)} – ${monthLabel(f.to)}`;
}

export const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
