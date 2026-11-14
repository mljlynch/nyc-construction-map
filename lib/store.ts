import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Shapes of what the map loads. The pipeline (pipeline/build_data.py) documents each field.
export type Meta = Record<string, unknown> & { months: string[] };
export type Series = Record<string, Partial<Record<'pj' | 'pu' | 'cj' | 'cu' | 'xj' | 'xu' | 'ij' | 'iu', number[]>>>;
export type FeatureCollection = { type: 'FeatureCollection'; features: unknown[] };
export type Projects = { never: number; boros: string[]; rows: unknown[][] };

/**
 * Where the map's data comes from. Routes only talk to this interface, so moving to a database
 * means adding another implementation (e.g. a PostgresStore that runs the same reads as SQL)
 * and switching `getStore()`; the routes and the page don't change.
 */
export interface DataStore {
  meta(): Promise<Meta>;
  series(): Promise<Series>;
  neighborhoods(): Promise<FeatureCollection>;
  projects(): Promise<Projects>;
}

/** Reads the JSON files the pipeline writes to data/ (bundled with each function via vercel.json). */
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
  series() { return this.load<Series>('series.json'); }
  neighborhoods() { return this.load<FeatureCollection>('ntas.geojson'); }
  projects() { return this.load<Projects>('projects.json'); }
}

let store: DataStore | undefined;
export function getStore(): DataStore {
  store ??= new JsonFileStore(path.join(process.cwd(), 'data'));
  return store;
}
