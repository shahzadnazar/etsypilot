import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionList } from '@/components/action-center/action-list'
import { WhereToStart } from '@/components/ui/where-to-start'
import { DataWithheld } from '@/components/sync/data-withheld'
import { withheldReason } from '@/domain/sync/source'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getActions } from '@/domain/action-center/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { isDemoMode } from '@/lib/etsy'

export const metadata: Metadata = { title: 'Action Center' }

export default async function ActionCenterPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  /*
   * D11 ASKS THE MODE, NOT THE SHOP ROW.
 *
   * The provenance badge's demo override exists so "a screenshot taken in demo
   * mode can never be mistaken for a real shop's figures" — a statement about
   * whether the FIGURES are the fictional catalogue. That is `ETSY_MODE`.
 *
   * It was `session.isDemo`, which is `shops.is_demo`: whether this shop has
   * ever connected. On a live deployment every new signup carries it, so every
   * figure on every screen was stamped Demo while the mock was serving none of
   * them — and the stamp would then disappear the moment the shop connected,
   * which is precisely when it would start to matter if it were true.
   */
  const demoData = isDemoMode()
  const { actions, counts, source } = await getActions(ctx)

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   "NOTHING NEEDS YOUR ATTENTION" IS THE MOST DANGEROUS SENTENCE IN THIS
   *   PRODUCT, AND IT MUST NOT BE SAID ABOUT DATA WE MAY NOT DISPLAY.
   * ══════════════════════════════════════════════════════════════════════
   *
   * The list's own empty copy is specific and reassuring — "No listing is
   * selling below cost, your cost coverage is complete, and nothing has
   * crossed your baseline" — three positive claims, none of them verifiable
   * for a shop whose orders have not been read, or whose receipts were read
   * longer ago than Etsy's API Terms §5 lets us display. The filter row goes
   * with it: zero across three tabs is the same reassurance in numbers.
   *
   * Returned BEFORE the recommendation is requested, which the version inside
   * the list could not do: a withheld Action Center used to pay for an AI call
   * on its way to showing nothing.
   */
  if (withheldReason(source)) {
    return (
      <>
        <PageHeader
          title="Action Center"
          subtitle="What needs your attention, ordered by measured impact. Every card carries its evidence and a destination."
        />
        <DataWithheld
          source={source}
          neverSynced="CobaltRank has not read your orders yet, so it cannot say what needs your attention — and it will not tell you that nothing does. Once a sync runs, every finding appears here with its evidence."
        />
      </>
    )
  }

  /*
   * ── WHERE TO START: THE ACTION'S OWN EXPLANATION ───────────────────────
   *
   * This called domain/ai/explain.ts, which handed the finding and the
   * evidence line to a model and fell back to `action.explanation` whenever
   * the model was unavailable or its answer was withheld. That fallback is
   * what renders now: the assistant was decorating the card's own sentence,
   * and D95 removed the assistant.
   *
   * Still the top open action only, which is the point of the block — the list
   * below is ordered by measured impact and this names the first one.
   */
  const top = actions.find((a) => a.status === 'OPEN') ?? actions[0]

  return (
    <>
      <PageHeader
        title="Action Center"
        subtitle="What needs your attention, ordered by measured impact. Every card carries its evidence and a destination."
      />
      {top ? (
        <Card className="mb-4 p-[18px]">
          <WhereToStart label={`Where to start · ${top.title}`} text={top.explanation} />
          <p className="mt-2 text-caption leading-relaxed text-muted-1">
            {/*
              * The paragraph about the assistant went with the assistant. What
              * is left is the thing that was true underneath it: this is the
              * card's own explanation, and the evidence for it is on the card.
              */}
            Advice, not instruction. It rests on the evidence shown on the card below and on
            nothing else.
          </p>
        </Card>
      ) : null}

      <ActionList actions={actions} counts={counts} demo={demoData} />
    </>
  )
}
