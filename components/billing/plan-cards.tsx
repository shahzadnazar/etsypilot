/*
 * The three plans, with the consequence of switching stated on the card.
 *
 * A plan card that only lists what you gain is half a card. The downgrade cards
 * say what pauses and that nothing is deleted; the upgrade card says what is
 * charged today, prorated, and what the next full charge will be — before the
 * button, not after it.
 */

import { Card } from '@/components/ui/card'
import { Money, Numeric } from '@/components/ui/numeric'
import type { PlanChange } from '@/domain/billing/lifecycle'
import type { Plan } from '@/domain/billing/plans'
import { cn } from '@/lib/utils/cn'

export function PlanCards({
  plans,
  currentPlanKey,
  changes,
  currency,
}: {
  plans: Plan[]
  currentPlanKey: string
  changes: PlanChange[]
  currency: string
}) {
  return (
    <section aria-label="Plans" className="grid gap-3 lg:grid-cols-3">
      {plans.map((plan) => {
        const current = plan.key === currentPlanKey
        const change = changes.find((c) => c.to.key === plan.key)

        return (
          <Card
            key={plan.key}
            className={cn('flex flex-col gap-3 p-[18px]', current && 'border-brand bg-brand-tint')}
          >
            <div className="flex items-baseline justify-between gap-2">
              {/*
                * h2, not h3. Each plan card is a top-level section of the
                * billing page, sibling to "Billing history" and "Trial terms",
                * and the page's only h1 is its title. As an h3 it skipped a
                * level, which for anyone navigating by heading reads as a
                * subsection of something that does not exist. Same size on
                * screen — text-section — so nothing moves.
                */}
              <h2 className="text-section text-ink-1">{plan.name}</h2>
              {current ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-strong">
                  Your plan
                </span>
              ) : null}
            </div>

            <Numeric className="text-metric text-ink-1">
              ${plan.priceMonthly}
              <span className="text-body font-normal text-muted-1">
                {plan.priceMonthly === 0 ? '' : ' / mo'}
              </span>
            </Numeric>
            <p className="text-caption text-muted-1">{plan.positioning}</p>

            <ul className="flex flex-col gap-1.5">
              {plan.includes.map((line) => (
                <li key={line} className="text-small leading-relaxed text-ink-2">
                  · {line}
                </li>
              ))}
              {plan.excludes.map((line) => (
                <li key={line} className="text-small leading-relaxed text-muted-1">
                  · {line}
                </li>
              ))}
            </ul>

            {change && change.kind !== 'SAME' ? (
              <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
                {change.charge ? (
                  <>
                    <span className="text-caption font-semibold text-ink-1">
                      <Money value={change.charge.amountDue} currency={currency} /> today
                    </span>
                    <ul className="flex flex-col gap-1">
                      {change.charge.whatChanges.map((line) => (
                        <li key={line} className="text-caption leading-snug text-muted-1">
                          · {line}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <span className="text-caption font-semibold text-ink-1">Nothing charged today</span>
                    <span className="text-caption leading-snug text-muted-1">{change.note}</span>
                  </>
                )}

                {change.pauses.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {change.pauses.map((line) => (
                      <li key={line} className="text-caption leading-snug text-muted-1">
                        · {line}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* mt-2: the same crowding as the action card. The button is
                    38px tall and had 9px of clear space, which target-size
                    counts against it. */}
                <form className="mt-3" action={`/api/billing/change/${plan.key.toLowerCase()}`} method="post">
                  <button
                    type="submit"
                    className={cn(
                      'h-11 w-full rounded-control text-[12px] font-semibold md:h-[38px]',
                      change.kind === 'UPGRADE'
                        ? 'bg-brand text-brand-on hover:bg-brand-strong'
                        : 'border border-line text-ink-2 hover:bg-canvas-soft',
                    )}
                  >
                    {change.kind === 'UPGRADE' ? `Upgrade to ${plan.name}` : `Move to ${plan.name}`}
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-auto pt-3">
                <span className="text-caption text-muted-1">
                  This is the plan you are on. Cancelling or moving is one click, below.
                </span>
              </div>
            )}
          </Card>
        )
      })}
    </section>
  )
}
