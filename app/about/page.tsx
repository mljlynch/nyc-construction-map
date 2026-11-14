import type { Metadata } from 'next';
import Link from 'next/link';
import { MadeBy } from '@/components/MadeBy';
import { getContext } from '@/lib/data/queries';
import { monthLabel } from '@/lib/format';

export const metadata: Metadata = {
  title: 'About · NYC Housing Map',
  description: 'Where the NYC Housing Map data comes from, how completions and permits are counted, and how future completions are estimated.',
  alternates: { canonical: '/about' },
};

const SOURCES = [
  { name: 'Housing Database Project Level Files', org: 'NYC Department of City Planning', id: 'br6q-ssj3', use: 'every new building since 2010: permits, completions, unit counts and neighborhoods' },
  { name: 'DOB NOW: Build – Job Application Filings', org: 'NYC Department of Buildings', id: 'w9ak-ipjd', use: 'new-building permits issued after the Housing Database’s latest release' },
  { name: 'DOB NOW: Build – Approved Permits', org: 'NYC Department of Buildings', id: 'rbx6-tga4', use: 'the earliest permit date for those newer projects' },
  { name: '2020 Neighborhood Tabulation Areas', org: 'NYC Department of City Planning', id: '9nt8-h7nd', use: 'neighborhood boundaries' },
];

export default async function About() {
  const { meta } = await getContext();
  const lastActual = meta.months[meta.months.indexOf(meta.projectedFrom) - 1];
  const medianText = (m: Record<string, number>) => Object.entries(m).map(([t, n]) => `${t.split(' (')[0].toLowerCase()} ${n} months`);
  const medians = medianText(meta.estimateMedians);
  const alterationMedians = medianText(meta.alterationMedians);
  return (
    <main className="about">
      <Link className="back" href="/">← Back to the map</Link>
      <h1>About the NYC Housing Map</h1>
      <p>
        A map of new residential construction in New York City: how many homes were finished and permitted in each neighborhood,
        month by month since 2010, with estimated completions through {monthLabel(meta.months[meta.months.length - 1])}.
      </p>

      <h2>Data sources</h2>
      <ul>
        {SOURCES.map(s => (
          <li key={s.id}>
            <a href={`https://data.cityofnewyork.us/d/${s.id}`} target="_blank" rel="noopener noreferrer">{s.name}</a> ({s.org}): {s.use}.
          </li>
        ))}
      </ul>
      <p>
        This release uses Housing Database {meta.hdbVersion}, which covers permits through {meta.hdbPermitCutoff} and completions through{' '}
        {meta.hdbCompleteCutoff}. City Planning documents the database on its{' '}
        <a href="https://www.nyc.gov/site/planning/data-maps/open-data/dwn-housing-database.page" target="_blank" rel="noopener noreferrer">Bytes of the Big Apple page</a>.
        The code and data pipeline are on <a href="https://github.com/mljlynch/nyc-construction-map" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>

      <h2>What&apos;s counted</h2>
      <ul>
        <li>
          <strong>New buildings</strong> by default. <strong>Include alterations</strong> also counts renovations that add homes to an existing
          building: conversions (for example office to residential), splitting or adding apartments, and enlargements. Renovations that don&apos;t
          change the number of homes aren&apos;t in the data. Withdrawn jobs are left out.
        </li>
        <li><strong>Units</strong> are net new homes (Class A units). <strong>Buildings</strong> counts each job once.</li>
        <li>
          <strong>Affordable units</strong> are the income-restricted units that NYC Housing Preservation and Development (HPD) links to each
          project in the Housing Database, including HPD-financed buildings and units required under inclusionary housing programs. HPD&apos;s records
          start in 2014, so earlier years show almost none. Projects from the newest DOB NOW filings don&apos;t have affordability data yet. In this view,
          markers show only projects with affordable units, sized by that count.
        </li>
        <li><strong>Completed</strong> uses the first certificate of occupancy. <strong>Permitted</strong> uses the first permit date. Both show totals for the months selected on the slider.</li>
        <li>
          <strong>Building type</strong> (in project tooltips) comes from the finished building&apos;s unit count: houses (1–2 units), small multifamily
          (3–9), mid-size apartments (10–49), large apartments (50+). DOB&apos;s own building-class fields are blank or &quot;Other&quot; for too many new
          buildings to use.
        </li>
        {meta.provisionalFrom && (
          <li>From {monthLabel(meta.provisionalFrom)} on, permits come from DOB NOW new-building filings that aren&apos;t in the Housing Database yet, so they&apos;re marked provisional. Alterations after that date aren&apos;t included yet.</li>
        )}
      </ul>

      <h2>Estimated completions</h2>
      <p>
        None of the sources include an expected completion date, so completions after {monthLabel(lastActual)} are estimated. For each permitted
        project that hasn&apos;t finished, the chance it finishes in a given month comes from how long similar buildings permitted in{' '}
        {meta.estimateTrainYears.join('–')} took, counting only those that were still unfinished at the same age. Typical totals from permit to
        completion for new buildings: {medians.join(', ')}. Alterations are modeled the same way from past alterations, which finish sooner
        ({alterationMedians.join(', ')}).
      </p>
      <ul>
        <li>Map and borough numbers are expected values, so they can be fractional.</li>
        <li>Each unfinished project&apos;s marker sits at a month drawn from its own estimate, so marker counts track the map without matching it exactly. Tooltips show the likely range.</li>
        <li>Estimates only cover projects that already have a permit, so future years undercount what will actually be built.</li>
        <li>Projects open longer than nearly all past examples get no estimate.</li>
      </ul>

      <h2>Reading the map</h2>
      <ul>
        <li>The 2015 and 2022 spikes are filings rushed in before the 421-a tax break expired.</li>
        <li>Unit colors use fixed thresholds. Building counts use breaks based on the neighborhoods in view.</li>
        <li>Every view has its own link: change the filters and use Copy link to share exactly what you&apos;re looking at.</li>
      </ul>

      <MadeBy />
    </main>
  );
}
