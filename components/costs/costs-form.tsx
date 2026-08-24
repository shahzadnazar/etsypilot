import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { COST_FIELDS, type CostSettings } from '@/domain/costs/types'
import { currencySymbol } from '@/lib/utils/format'

/*
 * The cost inputs.
 *
 * A plain <form> with a plain POST, no client component and no handler. Saving
 * your costs is not something that should stop working when a bundle fails to
 * load, and a server-rendered form is the only version of this that cannot.
 *
 * Every field is driven by COST_FIELDS, which is the same table the route
 * validates against. A bound shown to the seller and a bound enforced on the
 * server are the same bound.
 */
export function CostsForm({
  settings,
  currency,
  demo,
}: {
  settings: CostSettings
  currency: string
  demo: boolean
}) {
  return (
    <form method="post" action="/api/settings/costs" className="mt-5">
      <Card className="flex flex-col gap-4 p-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-section text-ink-1">Your costs</h2>
            <p className="max-w-prose text-caption leading-relaxed text-muted-1">
              These are yours, not Etsy&rsquo;s. Nothing here is sent to Etsy, and changing a figure
              changes only what EtsyPilot calculates.
            </p>
          </div>
          <ProvenanceBadge type="SELLER_INPUT" demo={demo} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {COST_FIELDS.map((field) => {
            const stored = settings[field.key]
            const value =
              stored === null
                ? ''
                : field.kind === 'PERCENT'
                  ? (stored * 100).toFixed(1)
                  : String(stored)
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-caption font-semibold text-ink-2">{field.label}</span>
                <span className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
                  {field.kind === 'MONEY' ? (
                    <span className="shrink-0 text-small text-muted-1">
                      {currencySymbol(currency)}
                    </span>
                  ) : null}
                  <input
                    name={field.key}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={field.min}
                    max={field.max}
                    defaultValue={value}
                    /*
                     * Not `required`. A blank ad-spend field is a meaningful
                     * answer — "I do not know" — and the browser attribute that
                     * would forbid it also forbids clearing a figure entered by
                     * mistake. The server decides which fields may be blank.
                     */
                    className="tnum h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
                  />
                  {field.kind === 'PERCENT' ? (
                    <span className="shrink-0 text-small text-muted-1">%</span>
                  ) : null}
                </span>
                <span className="text-caption leading-relaxed text-muted-1">{field.hint}</span>
              </label>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button type="submit" variant="primary">
            Save costs
          </Button>
          <span className="text-caption text-muted-1">
            Saved changes are recorded in the audit log as an EtsyPilot-only change.
          </span>
        </div>
      </Card>
    </form>
  )
}
