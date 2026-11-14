import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Meta } from '../types';

// Raw shapes of the pipeline's output (pipeline/build_data.py documents each field).
export type SeriesKey = 'pj' | 'pu' | 'cj' | 'cu' | 'xj' | 'xu' | 'ij' | 'iu';
export type RawSeries = Record<string, Partial<Record<SeriesKey, number[]>>>;
export type FeatureCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }[] };
// [lon, lat, units, p, c, e, boro, address, flags, type, nta, x, x_lo, x_hi]
export type RawProjectRow = [number, number, number, number, number, number, number, string, string, number, string, number, number, number];
export type RawProjects = { never: number; boros: string[]; rows: RawProjectRow[] };

/**
 * Where the map's data comes from. Queries (lib/data/queries.ts) only use this interface, so
 * moving to a database means adding another implementation and switching `getStore()`.
 */
export interface DataStore {
  meta(): Promise<Meta>;
  series(): Promise<RawSeries>;
  neighborhoods(): Promise<FeatureCollection>;
  projects(): Promise<RawProjects>;
}

/** Reads the JSON files the pipeline writes to data/ (shipped with each function; see next.config.ts). */
class JsonFileStore implements DataStore {
  // Parsed files stay in memory for the life of a warm function instance.
  private cache = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  private load<T>(file: string): Promise<T> {
    let hit = this.cache.get(file);
    if (!hit) {
      hit = readFile(path.join(this.dir, file), 'utf8').then(JSON.parse);
      hit.catch(() => this.cache.delete(file)); // don't pin a failed read
      this.cache.set(file, hit);
    }
    return hit as Promise<T>;
  }

  meta() { return this.load<Meta>('meta.json'); }
  series() { return this.load<RawSeries>('series.json'); }
  neighborhoods() { return this.load<FeatureCollection>('ntas.geojson'); }
  projects() { return this.load<RawProjects>('projects.json'); }
}

let store: DataStore | undefined;
export function getStore(): DataStore {
  store ??= new JsonFileStore(path.join(process.cwd(), 'data'));
  return store;
}
