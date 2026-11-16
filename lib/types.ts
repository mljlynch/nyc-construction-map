// Response shapes shared by the API routes and the client.

export interface Meta {
  months: string[];
  boros: string[];
  buildingTypes: string[];
  hdbVersion: string;
  hdbPermitCutoff: string;
  hdbCompleteCutoff: string;
  provisionalFrom: string | null;
  staleYears: number | null;
  dataEnd: string;
  projectedFrom: string;
  estimateTrainYears: [number, number];
  estimateMedians: Record<string, number>;
  alterationMedians: Record<string, number>;
}

export interface NeighborhoodInfo {
  nta: string;
  name: string;
  boro: string;
}

export interface ChoroplethResponse {
  values: Record<string, number>; // every NTA with data; the client dims ones outside the filter
  breaks: number[]; // lower bounds of color classes 2..7 (class 1 starts above zero)
  totals: Record<string, number>; // by borough
  affordableTotals: Record<string, number> | null; // by borough, only with the units measure
  total: number;
  // The part inside LPC historic protections, and the percentage of land those protections cover.
  historic: { totals: Record<string, number>; total: number; landShares: Record<string, number>; landShare: number };
}

export interface ProjectProps {
  u: number; // units
  aff: number; // affordable units (HPD)
  ty: number; // building type index into meta.buildingTypes
  a: string; // address
  alt: boolean; // alteration rather than new building
  dob: boolean; // provisional DOB NOW filing
  h: boolean; // inside an LPC historic district or on a landmark site
  p: number; // permit month index (may be negative for pre-2010)
  c: number | null; // completion month index
  xl: number | null; // likely completion range (estimate), month indices
  xh: number | null;
  est: boolean; // placed by an estimated completion rather than an actual one
}

export interface ProjectsResponse {
  type: 'FeatureCollection';
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: ProjectProps }[];
}

export interface SeriesResponse {
  neighborhoods: string[];
  actual: number[]; // per month
  estimated: number[]; // per month; nonzero only for estimated completions
  total: number; // over the selected range
}
