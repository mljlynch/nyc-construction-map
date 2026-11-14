import { HousingMap } from '@/components/HousingMap';
import { getContext } from '@/lib/data/queries';
import { parseFilters } from '@/lib/filters';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'NYC Housing Map',
  url: 'https://nychousingmap.com/',
  description:
    'Interactive map of new residential construction in New York City by neighborhood and month: units and buildings completed and permitted since 2010, with estimated completions through 2029.',
  applicationCategory: 'ReferenceApplication',
  operatingSystem: 'Any',
  isAccessibleForFree: true,
  image: 'https://nychousingmap.com/og.jpg',
  spatialCoverage: { '@type': 'Place', name: 'New York City' },
  isBasedOn: [
    'https://data.cityofnewyork.us/d/br6q-ssj3',
    'https://data.cityofnewyork.us/d/w9ak-ipjd',
    'https://data.cityofnewyork.us/d/rbx6-tga4',
    'https://data.cityofnewyork.us/d/9nt8-h7nd',
  ],
};

// The filters in a shared link are parsed here, so the first render already matches the link.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ meta, ctx, neighborhoods }, params] = await Promise.all([getContext(), searchParams]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <noscript>
        <p style={{ padding: 16 }}>
          NYC Housing Map is an interactive map of new residential construction in New York City: units and buildings completed and permitted in each neighborhood since 2010, with estimated completions through 2029, from NYC Planning&apos;s Housing Database and DOB NOW.
          It needs JavaScript to run.
        </p>
      </noscript>
      <HousingMap meta={meta} ctx={ctx} neighborhoods={neighborhoods} initialFilters={parseFilters(params, ctx)} />
    </>
  );
}
