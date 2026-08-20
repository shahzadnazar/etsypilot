/*
 * AI draft review.
 *
 * Split view: what is live on Etsy, and what the draft would make it. The live
 * side is badged Verified and is never editable here; the draft side is badged
 * AI draft and cannot leave this screen except through the bulk editor.
 *
 * Three things this component will not do, each of which is a product rule:
 *
 *   - It renders no predicted impact. The type has no field for one, and the
 *     footer says plainly that impact is tracked after publishing, not
 *     forecast before it.
 *   - Its primary button says "Send to review" rather than "Publish", because
 *     that is what it does: it opens the bulk editor with the change loaded.
 *   - Every drafted element names its source under the field. A draft with an
 *     unexplained addition is indistinguishable from an invention.
 */

import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { AiDraft, DraftSource } from '@/domain/ai/types'

function Sources({ sources }: { sources: DraftSource[] }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <li
          key={s.label}
          className="rounded-control border border-line px-2 py-0.5 text-[11px] text-muted-1"
        >
          Source: {s.label}
        </li>
      ))}
    </ul>
  )
}

export function DraftReview({ draft, demo }: { draft: AiDraft; demo: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-4 p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-section text-ink-1">Current — live on Etsy</h3>
          <ProvenanceBadge
            type="VERIFIED"
            demo={demo}
            srDetail="Read from your connected shop. This side is never edited here."
          />
        </div>

        <Field label="Title" meta={`${draft.current.title.length} chars`}>
          {draft.current.title}
        </Field>

        <Field label="Tags" meta={`${draft.current.tags.length} of 13`}>
          <TagList tags={draft.current.tags} />
        </Field>

        <Field label="Description opening">
          {draft.current.description.slice(0, 220)}
          {draft.current.description.length > 220 ? '…' : ''}
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-[18px]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-section text-ink-1">AI draft — needs approval</h3>
          <ProvenanceBadge
            type="AI_DRAFT"
            demo={demo}
            srDetail="Generated from your listing text and your saved keywords. Nothing publishes without your approval."
          />
        </div>

        <Field label="Title" meta={`${draft.title.characterCount} chars`}>
          {draft.title.text}
          <Sources sources={draft.title.sources} />
        </Field>

        <Field label="Tags" meta={`${draft.tags.tags.length} of 13`}>
          <TagList tags={draft.tags.tags} added={draft.tags.added} removed={draft.tags.removed} />
          <Sources sources={draft.tags.sources} />
        </Field>

        {draft.description ? (
          <Field label="Description">
            {draft.description.text.slice(0, 220)}
            <Sources sources={draft.description.sources} />
          </Field>
        ) : (
          <Field label="Description">
            <span className="text-muted-1">
              Not rewritten. Turn on “Rewrite description as well” to include it.
            </span>
          </Field>
        )}
      </Card>

      <Card className="p-[18px] lg:col-span-2">
        <h3 className="text-section text-ink-1">What changed and why</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {draft.rationale.map((r) => (
            <li key={r} className="text-small leading-relaxed text-ink-2">
              · {r}
            </li>
          ))}
        </ul>
        {draft.advisories.length > 0 ? (
          <div className="mt-3 rounded-card border border-line p-3">
            <span className="text-label text-muted-1">Worth a look before you approve</span>
            <ul className="mt-1.5 flex flex-col gap-1">
              {draft.advisories.map((a) => (
                <li key={a} className="text-caption leading-relaxed text-ink-2">
                  · {a}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-caption leading-snug text-muted-1">
              These are judgement calls, not rule breaks — a draft that broke a rule would have
              been withheld rather than shown with a warning.
            </p>
          </div>
        ) : null}

        <p className="mt-3 text-caption leading-relaxed text-muted-1">
          Impact is not predicted. After publishing, track the result in the experiment tracker —
          EtsyPilot measures what happened rather than forecasting what will. Checked against the
          guardrails before you saw it: no invented figures, no ranking claims, no forecasts.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/listings/bulk-editor?draft=${draft.id}`}
            className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-strong md:h-[38px]"
          >
            Send to review
          </Link>
          <Button variant="secondary">Edit before accepting</Button>
          <Button variant="secondary">Reject</Button>
          <span className="text-caption text-muted-1">
            “Send to review” opens the bulk editor with this change loaded. Nothing reaches Etsy
            until you have seen the diff there and confirmed it.
          </span>
        </div>
      </Card>
    </div>
  )
}

function Field({
  label,
  meta,
  children,
}: {
  label: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {meta ? <Numeric className="text-caption text-muted-1">{meta}</Numeric> : null}
      </div>
      <div className="text-small leading-relaxed text-ink-1">{children}</div>
    </div>
  )
}

function TagList({
  tags,
  added = [],
  removed = [],
}: {
  tags: string[]
  added?: string[]
  removed?: string[]
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const isNew = added.includes(t)
        return (
          <li
            key={t}
            className="rounded-control border px-2 py-1 text-caption"
            style={
              isNew
                ? { background: '#F0FDF4', borderColor: '#BBF7D0', color: '#166534' }
                : { borderColor: 'var(--border)', color: 'var(--ink-2)' }
            }
          >
            {isNew ? '+ ' : ''}
            {t}
          </li>
        )
      })}
      {removed.map((t) => (
        <li
          key={t}
          className="rounded-control border px-2 py-1 text-caption line-through"
          style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}
        >
          − {t}
        </li>
      ))}
    </ul>
  )
}
