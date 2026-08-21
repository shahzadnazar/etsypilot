'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DiagnosisBadge } from '@/components/provenance/diagnosis-badge'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { DetectedChange } from '@/domain/shop-pulse/types'
import { CONFIDENCE_LABEL } from '@/lib/provenance/types'
import { cn } from '@/lib/utils/cn'

/*
 * Detected changes and their evidence (artboard 91).
 *
 * Selecting a row opens the evidence that produced its verdict. The badge is an
 * entry point, not a verdict - so the panel is never empty and never optional.
 */
export function ChangesPanel({ changes }: { changes: DetectedChange[] }) {
  const [selectedId, setSelectedId] = useState(changes[0]?.id ?? '')
  const selected = changes.find((c) => c.id === selectedId) ?? changes[0]

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line p-[18px]">
          <h2 className="text-section text-ink-1">Detected changes</h2>
          <span className="text-caption text-muted-1">
            Ordered by measured impact · select a row to open its evidence
          </span>
        </div>

        <table className="w-full border-collapse text-body">
          <caption className="sr-only">
            Changes detected in this period, each with the diagnosis reached from the evidence.
          </caption>
          <thead>
            <tr className="bg-canvas-soft text-left text-label text-muted-1">
              <th scope="col" className="px-[18px] py-2.5 font-semibold">Change</th>
              <th scope="col" className="hidden px-3 py-2.5 font-semibold sm:table-cell">Scope</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                Orders after
              </th>
              <th scope="col" className="px-[18px] py-2.5 font-semibold">Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => {
              const active = c.id === selected?.id
              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'cursor-pointer border-t border-line align-top transition-colors',
                    active ? 'bg-brand-tint' : 'hover:bg-canvas-soft',
                  )}
                >
                  <td className="px-[18px] py-3">
                    {/* The row is the control, so the button carries the label
                        and the whole row is the hit area. */}
                    <button
                      onClick={() => setSelectedId(c.id)}
                      aria-pressed={active}
                      className="text-left"
                    >
                      <span className="block text-[12.5px] font-semibold leading-snug text-ink-1">
                        {c.title}
                      </span>
                      <span className="tnum mt-1 block text-caption text-muted-1">{c.detail}</span>
                    </button>
                  </td>
                  <td className="hidden px-3 py-3 text-small text-ink-2 sm:table-cell">
                    {c.scope}
                    {c.eventType === null ? (
                      <span className="mt-0.5 block text-caption text-muted-1">
                        residual after the {changes.filter((x) => x.diagnosis === 'CORRELATED').length}{' '}
                        recorded changes
                      </span>
                    ) : null}
                  </td>
                  <td
                    className="tnum whitespace-nowrap px-3 py-3 text-right text-small font-semibold"
                    style={{
                      color:
                        (c.ordersAfterPercent ?? 0) < 0 ? 'var(--danger)' : 'var(--ink-2)',
                    }}
                  >
                    {c.ordersAfterPercent === null ? (
                      <span className="font-normal text-muted-1">Not enough data</span>
                    ) : (
                      `${c.ordersAfterPercent}%`
                    )}
                  </td>
                  <td className="px-[18px] py-3">
                    <DiagnosisBadge diagnosis={c.diagnosis} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {selected ? <EvidencePanel change={selected} /> : null}
    </div>
  )
}

/**
 * The evidence panel.
 *
 * Structure is fixed: what was observed, what else was tested, confidence,
 * coverage, limitations. Every section is present for every verdict - a
 * diagnosis with nothing behind it is not shippable.
 */
function EvidencePanel({ change }: { change: DetectedChange }) {
  const e = change.evidence
  return (
    <Card className="flex flex-col gap-4 p-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.06em] text-muted-1">Evidence</span>
          <h3 className="text-section text-ink-1">{change.title}</h3>
        </div>
        <DiagnosisBadge diagnosis={change.diagnosis} />
      </div>

      <Section title="What was observed">
        <ul className="flex flex-col gap-2">
          {e.observed.map((o) => (
            <li key={o} className="tnum text-small leading-relaxed text-ink-2">
              {o}
            </li>
          ))}
        </ul>
      </Section>

      {/* Ruled-out alternatives stay visible: knowing what did NOT cause a drop
          is half the diagnosis. */}
      <Section title="Also tested">
        <ul className="flex flex-col gap-2">
          {e.alsoTested.map((a) => (
            <li key={a.label} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-small font-semibold text-ink-1">{a.label}</span>
                <DiagnosisBadge diagnosis={a.verdict} />
              </span>
              <span className="text-caption leading-relaxed text-muted-1">{a.note}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Meta label="Confidence" value={CONFIDENCE_LABEL[e.confidence]} note={e.confidenceNote} />
        <Meta label="Coverage" value={`${e.coveragePercent}%`} note={e.coverageNote} />
      </div>

      <Section title="Limitations">
        <ul className="flex list-disc flex-col gap-1.5 pl-4">
          {e.limitations.map((l) => (
            <li key={l} className="text-caption leading-relaxed text-muted-1">
              {l}
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
        {change.destinations.map((d, i) => (
          <Link
            key={d.href}
            href={d.href}
            className={cn(
              'rounded-control px-3 py-2 text-[12px] font-semibold',
              i === 0
                ? 'bg-brand text-brand-on hover:bg-brand-strong'
                : 'border border-line text-ink-2 hover:bg-canvas-soft',
            )}
          >
            {d.label}
          </Link>
        ))}
      </div>

      <p className="text-caption text-muted-1">
        Correlation only. EtsyPilot cannot see Etsy&rsquo;s ranking algorithm.
      </p>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-label uppercase tracking-[0.06em] text-muted-1">{title}</h4>
      {children}
    </section>
  )
}

function Meta({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-control border border-line p-3">
      <span className="block text-label text-muted-1">{label}</span>
      <Numeric className="mt-1 block text-[15px] font-semibold text-ink-1">{value}</Numeric>
      <span className="mt-0.5 block text-caption leading-snug text-muted-1">{note}</span>
    </div>
  )
}
