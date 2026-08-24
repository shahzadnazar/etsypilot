import Link from 'next/link'
import type { ListingsView } from '@/domain/listings/service'
import { STATUS_LABEL, type HealthKind } from '@/domain/listings/types'

/*
 * The filter row (artboard 36).
 *
 * A GET form, so a filtered view is a URL: it can be sent to someone, it
 * survives a reload, and it works with no JavaScript. Selection and bulk
 * actions are NOT here — the Safe Bulk Editor owns that flow end to end
 * (SELECT → CONFIGURE → VALIDATE → DIFF → CONFIRM → APPLY → AUDIT → ROLLBACK),
 * and a second half-implemented selection surface beside it would be a way to
 * skip steps that exist to stop mistakes.
 */

const HEALTH_LABEL: Record<HealthKind, string> = {
  GOOD: 'Good',
  NEEDS_WORK: 'Needs work',
  ERRORS: 'Has errors',
}

export function ListingFilters({ view }: { view: ListingsView }) {
  const active =
    view.filters.q !== '' ||
    view.filters.status !== 'ALL' ||
    view.filters.health !== 'ALL' ||
    view.filters.section !== 'ALL'

  return (
    <form method="get" action="/listings" className="mb-4 flex flex-wrap items-center gap-2">
      <label className="flex flex-1 items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand sm:max-w-[320px]">
        <span className="sr-only">Search title, tag or SKU</span>
        <input
          name="q"
          type="search"
          defaultValue={view.filters.q}
          placeholder="Search title, tag or SKU"
          className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
        />
      </label>

      <Select name="status" label="Status" value={view.filters.status} anyLabel="Any status">
        {view.statuses.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Select>

      <Select name="health" label="SEO health" value={view.filters.health} anyLabel="Any health">
        {view.healths.map((h) => (
          <option key={h} value={h}>
            {HEALTH_LABEL[h]}
          </option>
        ))}
      </Select>

      <Select name="section" label="Section" value={view.filters.section} anyLabel="Any section">
        {view.sections.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <button
        type="submit"
        className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
      >
        Apply
      </button>

      {active ? (
        <Link
          href="/listings"
          className="inline-flex h-11 items-center rounded-control px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Clear
        </Link>
      ) : null}
    </form>
  )
}

function Select({
  name,
  label,
  value,
  anyLabel,
  children,
}: {
  name: string
  label: string
  value: string
  anyLabel: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
      >
        <option value="ALL">{anyLabel}</option>
        {children}
      </select>
    </label>
  )
}
