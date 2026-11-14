import { monthLabel } from '@/lib/format';
import type { Meta } from '@/lib/types';

export function Notes({ meta }: { meta: Meta }) {
  const lastActual = meta.months[meta.months.indexOf(meta.projectedFrom) - 1];
  const medians = Object.entries(meta.estimateMedians).map(([t, m]) => `${t.split(' (')[0].toLowerCase()} ${m} mo`).join(', ');
  return (
    <div className="note">
      <p>
        Source: NYC DCP Housing Database {meta.hdbVersion} (new buildings{meta.includeAlterations ? ' and unit-adding alterations' : ''}; withdrawn jobs
        excluded). Units are net new Class A units. Permitted by first permit date, completed by first certificate of occupancy.
      </p>
      <p>
        Project tooltips show building type, set by the finished building&apos;s unit count: houses (1–2 units), small multifamily (3–9), mid-size
        apartments (10–49), large apartments (50+). DOB&apos;s own building-class fields are blank or &quot;Other&quot; for too many new buildings to use.
      </p>
      {meta.provisionalFrom && (
        <p>From {monthLabel(meta.provisionalFrom)} on, permits come from DOB NOW new-building filings not yet in the Housing Database (one record per job, earliest permit).</p>
      )}
      <p>
        Completions after {monthLabel(lastActual)} are estimates. For each permitted project not yet finished, the chance it finishes in a given month comes
        from how long similar buildings permitted in {meta.estimateTrainYears.join('–')} took, counting only those that were still unfinished at the same
        age (typical totals: {medians}). Map and borough numbers are expected values, so they can be fractional. Each unfinished project&apos;s marker is
        placed at a month drawn from its own estimate, so marker counts track the map without matching it exactly; tooltips show the likely range (middle
        50%). They only cover projects already permitted, so future years undercount what will actually finish. Projects open longer than nearly all past
        examples get no estimate and stay in progress.
      </p>
      {meta.staleYears && (
        <p>&quot;In progress&quot; = permitted and not yet complete at the end of the range; jobs still open {meta.staleYears} years after their permit are treated as abandoned.</p>
      )}
      <p>
        The 2015 and 2022 spikes are filings rushed in before the 421-a tax break expired. Unit colors use fixed thresholds; building counts use breaks
        computed over every window of the selected length, so sliding or playing the window stays comparable.
      </p>
    </div>
  );
}
