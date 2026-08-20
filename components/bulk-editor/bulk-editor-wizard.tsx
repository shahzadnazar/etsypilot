'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  applicableItems,
  createDraft,
  validateOperation,
} from '@/domain/bulk-editor/service'
import { ROLLBACK_WINDOW_DAYS } from '@/domain/bulk-editor/service'
import type { FieldChange } from '@/domain/bulk-editor/types'
import type { EtsyListing } from '@/lib/etsy/interface'
import { cn } from '@/lib/utils/cn'
import { BulkStepper } from './stepper'
import { ConfirmDialog } from './confirm-dialog'
import { DiffViewer } from './diff-viewer'
import { ValidationSummaryPanel } from './validation-summary'

/*
 * The bulk editor wizard.
 *
 * Configuration and validation run client-side for responsiveness, but they are
 * a preview, not the authority: the server re-validates and re-fingerprints
 * before any write, so a tampered client cannot skip a step. What the seller
 * sees here is exactly what the server will re-derive.
 *
 * Demo mode never reaches publish — the confirm dialog explains why rather than
 * offering a button that fails.
 */
export function BulkEditorWizard({
  listings,
  costs,
  demo,
  now,
}: {
  listings: EtsyListing[]
  costs: [string, number][]
  demo: boolean
  now: string
}) {
  const [step, setStep] = useState(2)
  const [pricePercent, setPricePercent] = useState(8)
  const [skipBelowCostFloor, setSkipBelowCostFloor] = useState(true)
  const [tagsToAdd, setTagsToAdd] = useState('birth month jewelry, autumn gift')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  const changes = useMemo<FieldChange[]>(() => {
    const list: FieldChange[] = [
      { kind: 'PRICE', mode: 'PERCENT', amount: pricePercent, roundTo: 0.5, skipBelowCostFloor },
    ]
    const tags = tagsToAdd.split(',').map((t) => t.trim()).filter(Boolean)
    if (tags.length > 0) list.push({ kind: 'TAGS', mode: 'ADD', tags })
    return list
  }, [pricePercent, skipBelowCostFloor, tagsToAdd])

  const { operation, summary } = useMemo(() => {
    const draft = createDraft({
      id: 'BE-2291',
      ctx: { shopId: 'preview', actorId: 'preview', readOnly: true },
      changes,
      listings,
      now,
    })
    return validateOperation(draft, listings, { costs: new Map(costs), feeRate: 0.162 }, now)
  }, [changes, listings, costs, now])

  const willWrite = applicableItems(operation)

  return (
    <>
      <Card className="mb-4 p-[18px]">
        <BulkStepper current={step} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          {/* Step 3 — configure */}
          <Card className="flex flex-col gap-4 p-[18px]">
            <h2 className="text-section text-ink-1">Configure changes</h2>

            <Field label="Price">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={pricePercent}
                  onChange={(e) => setPricePercent(Number(e.target.value))}
                  aria-label="Price change percentage"
                  className="tnum h-11 w-24 rounded-card border border-line bg-surface px-3 text-body text-ink-1 md:h-[38px]"
                />
                <span className="text-small text-muted-1">% · rounded to the nearest $0.50</span>
              </div>
              <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-small text-ink-2">
                <input
                  type="checkbox"
                  checked={skipBelowCostFloor}
                  onChange={(e) => setSkipBelowCostFloor(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                />
                Skip listings that would fall below my cost floor
              </label>
            </Field>

            <Field label="Tags to add">
              <input
                value={tagsToAdd}
                onChange={(e) => setTagsToAdd(e.target.value)}
                aria-label="Tags to add, comma separated"
                className="h-11 w-full rounded-card border border-line bg-surface px-3 text-body text-ink-1 md:h-[38px]"
              />
              <p className="mt-2 text-caption leading-relaxed text-muted-1">
                Listings already at 13 tags will be reported as warnings rather than silently
                truncated.
              </p>
            </Field>

            {step < 3 ? (
              <div>
                <Button variant="primary" onClick={() => setStep(3)}>
                  Validate {listings.length} listings
                </Button>
              </div>
            ) : null}
          </Card>

          {/* Step 4 — validate */}
          {step >= 3 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-section text-ink-1">Step 4 · Validation</h2>
              <ValidationSummaryPanel summary={summary} />
              {step === 3 ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => setStep(4)}>
                    Continue to review
                  </Button>
                  <Button variant="secondary">Download report</Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 5 — review and publish */}
          {step >= 4 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-section text-ink-1">Step 5 · Review &amp; publish</h2>
              <DiffViewer items={willWrite} />

              <Card className="flex flex-col gap-3 p-[18px]">
                <p className="text-small leading-relaxed text-ink-2">
                  This updates{' '}
                  <span className="tnum font-semibold text-ink-1">{willWrite.length}</span> live
                  listings on Etsy. A rollback point is created automatically and stays available
                  for {ROLLBACK_WINDOW_DAYS} days.
                </p>
                {publishError ? (
                  <p
                    role="alert"
                    className="rounded-control border p-3 text-small leading-relaxed"
                    style={{ background: '#FEF2F2', borderColor: '#FECACA', color: 'var(--ink-2)' }}
                  >
                    {publishError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary">Schedule instead</Button>
                  <Button variant="primary" onClick={() => setConfirmOpen(true)}>
                    Publish to {willWrite.length} listings
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}
        </div>

        {/* Job summary rail */}
        <Card className="flex h-fit flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">Job summary</h2>
          <Summary label="Listings" value={String(listings.length)} />
          <Summary label="Will be written" value={String(willWrite.length)} />
          <Summary
            label="Fields changed"
            value={changes.map((c) => c.kind.toLowerCase()).join(', ')}
          />
          <Summary label="Runs" value="Immediately" />
          <Summary label="Rollback window" value={`${ROLLBACK_WINDOW_DAYS} days`} />
          <Summary label="Approval" value="Not required" />
          <p className="mt-1 border-t border-line pt-3 text-caption leading-relaxed text-muted-1">
            Nothing is sent to Etsy until you confirm on the review step.
          </p>
        </Card>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          count={willWrite.length}
          onCancel={() => setConfirmOpen(false)}
          onSchedule={() => setConfirmOpen(false)}
          onPublish={() => {
            setConfirmOpen(false)
            // Demo mode cannot write. The refusal is surfaced as the product's
            // own explanation rather than a generic failure.
            setPublishError(
              demo
                ? 'Demo mode cannot publish to Etsy. Connect your own shop to make real changes — nothing here touches a live listing.'
                : null,
            )
          }}
        />
      ) : null}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5')}>
      <span className="text-label text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-small">
      <span className="text-muted-1">{label}</span>
      <span className="tnum text-right font-semibold text-ink-1">{value}</span>
    </div>
  )
}
