import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ScopeList } from '@/components/connect/scope-list'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { GOALS, ONBOARDING_STEPS, ROLES, setupChecklist } from '@/domain/connect/service'
import { getSession } from '@/lib/auth'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Get started' }

/*
 * Onboarding.
 *
 * Five steps, every one skippable. The connect step carries the password
 * disclosure and the scope grouping; the checklist afterwards states what each
 * item buys rather than nagging for completion, and disappears when done.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { step } = await searchParams
  const current = ONBOARDING_STEPS.findIndex((s) => s.key === step)
  const index = current === -1 ? 0 : current
  const active = ONBOARDING_STEPS[index]
  const checklist = setupChecklist({ hasCosts: false, hasAudit: false, hasSearch: false })
  const done = checklist.filter((i) => i.done).length

  return (
    <>
      <PageHeader
        title="Get started"
        subtitle={`Step ${index + 1} of ${ONBOARDING_STEPS.length} · ${active?.label ?? ''} · every step can be skipped`}
        actions={<Button variant="secondary">Save &amp; exit</Button>}
      />

      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Onboarding steps">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s.key}>
            <Link
              href={`/onboarding?step=${s.key}`}
              aria-current={i === index ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-caption',
                i === index
                  ? 'border-brand bg-brand-tint font-semibold text-brand-strong'
                  : 'border-line text-muted-1 hover:bg-canvas-soft',
              )}
            >
              <span className="tnum">{i + 1}</span> {s.label}
            </Link>
          </li>
        ))}
      </ol>

      {active?.key === 'role' ? (
        <Section
          title="What best describes you?"
          note="We use this to choose your default dashboard and which tools appear first. You can change it any time in Profile."
          options={ROLES.map((r) => ({ key: r.key, label: r.label, detail: r.detail, href: '/onboarding?step=goal' }))}
        />
      ) : null}

      {active?.key === 'goal' ? (
        <Section
          title="What should EtsyPilot help with first?"
          note="Pick one. The others stay available in the sidebar — nothing is hidden by this choice."
          options={GOALS.map((g) => ({ key: g.key, label: g.label, detail: g.detail, href: g.href }))}
        />
      ) : null}

      {active?.key === 'connect' || active?.key === 'permissions' ? (
        <div className="flex flex-col gap-4">
          <ScopeList />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Continue to Etsy</Button>
            <Link
              href="/research/keywords"
              className="text-caption font-semibold text-brand-strong underline underline-offset-2"
            >
              Explore without connecting
            </Link>
            <span className="text-caption text-muted-1">
              Research tools stay available. Profit, listings and orders need a connected shop.
            </span>
          </div>
        </div>
      ) : null}

      {active?.key === 'value' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-[18px]">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-section text-ink-1">Finish setting up</h2>
              <span className="tnum text-caption text-muted-1">
                {done} of {checklist.length} done · this checklist disappears when complete.
              </span>
            </div>
            <Button variant="secondary">Dismiss</Button>
          </div>

          <ul className="flex flex-col divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 p-[18px]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      'text-small font-semibold',
                      item.done ? 'text-muted-1 line-through' : 'text-ink-1',
                    )}
                  >
                    {item.label}
                  </span>
                  {item.detail ? (
                    <span className="text-caption leading-snug text-muted-1">{item.detail}</span>
                  ) : null}
                  {item.completedNote ? (
                    <span className="text-caption text-muted-1">{item.completedNote}</span>
                  ) : null}
                </div>
                <Link
                  href={item.href}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center rounded-control px-3 text-[12px] font-semibold md:h-[38px]',
                    item.done
                      ? 'border border-line text-ink-2 hover:bg-canvas-soft'
                      : 'bg-brand text-white hover:bg-brand-strong',
                  )}
                >
                  {item.cta}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  )
}

function Section({
  title,
  note,
  options,
}: {
  title: string
  note: string
  options: { key: string; label: string; detail: string; href: string }[]
}) {
  return (
    <section>
      <h2 className="text-section text-ink-1">{title}</h2>
      <p className="mt-1 max-w-[75ch] text-caption leading-relaxed text-muted-1">{note}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <Link key={o.key} href={o.href} className="text-left">
            <Card className="flex h-full flex-col gap-1.5 p-[14px] hover:border-brand">
              <span className="text-small font-semibold text-ink-1">{o.label}</span>
              <span className="text-caption leading-snug text-muted-1">{o.detail}</span>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-caption font-semibold text-brand-strong underline underline-offset-2"
        >
          Skip for now
        </Link>
      </div>
    </section>
  )
}
