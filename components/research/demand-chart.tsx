import { MonthlySeriesChart } from '@/components/charts/monthly-series'

/*
 * Twelve-month modelled demand.
 *
 * The drawing moved to components/charts/monthly-series.tsx when the operator
 * panel needed the same mechanism for a counted series. Nothing about this
 * chart changed: the props, the gap behaviour and every word of the copy are
 * as they were.
 *
 * WHAT DID NOT MOVE IS THE CLAIM. "Indexed, modelled monthly" and "modelled
 * demand" are true here and would be false of a count, so they stay with the
 * caller that can vouch for them. A shared component that carried them would
 * have put "modelled" on a figure somebody counted — a provenance failure
 * arriving through a shared component rather than through a shared number.
 *
 * Sparse months break the line rather than being bridged. An interpolated line
 * over a month with no observation is the chart equivalent of filling a null
 * with a zero: it looks like data and it is a drawing.
 *
 * Months are plotted from their YYYY-MM key and never passed through a zoned
 * formatter (D24).
 */
export function DemandChart({
  history,
  term,
}: {
  history: { month: string; index: number | null }[]
  term: string
}) {
  const sparse = history.filter((p) => p.index === null).length

  return (
    <MonthlySeriesChart
      points={history.map((p) => ({ month: p.month, value: p.index }))}
      description={`Twelve months of modelled demand for ${term}. ${sparse} month${sparse === 1 ? '' : 's'} had too little observation to model and are left blank.`}
      caption={
        <>
          Indexed, modelled monthly.{' '}
          {sparse > 0
            ? `${sparse} month${sparse === 1 ? '' : 's'} had too little observation to model — the line breaks rather than guessing across the gap.`
            : 'Every month in this window had enough observation to model.'}
        </>
      }
    />
  )
}
