import { Check, X } from 'lucide-react'
import Link from 'next/link'
import type { Action, ActionSeverity } from '@/domain/action-center/types'
import { SEVERITY_LABEL } from '@/domain/action-center/types'
import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/format'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'

/*
 * The Action card (artboard 108).
 *
 * Four states, each visually distinct without relying on colour alone:
 *
 *   OPEN         left rule in the severity colour, numbered rank chip
 *   IN_PROGRESS  adds a progress chip and a "last worked" line
 *   COMPLETED    success rule, check icon, operation ID and measured outcome
 *   DISMISSED    dashed border, reduced opacity, reason kept, Restore action
 *
 * Every card names its evidence and goes somewhere. Dismissed cards keep their
 * reason and can be restored - the list is a record, not a queue that empties
 * into nothing.
 */

const SEVERITY_FILL: Record<ActionSeverity, { bg: string; border: string; fg: string }> = {
  CRITICAL: { bg: 'var(--danger-surface)', border: 'var(--danger-border)', fg: 'var(--danger-ink)' },
  ATTENTION: { bg: 'var(--warning-surface)', border: 'var(--warning-border)', fg: 'var(--warning-ink)' },
  INFO: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--muted-1)' },
}

const SEVERITY_RULE: Record<ActionSeverity, string> = {
  CRITICAL: 'var(--danger)',
  ATTENTION: 'var(--warning)',
  INFO: 'var(--muted-2)',
}

export function ActionCard({ action, demo }: { action: Action; demo: boolean }) {
  const isDismissed = action.status === 'DISMISSED'
  const isCompleted = action.status === 'COMPLETED'
  const severity = SEVERITY_FILL[action.severity]

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-card border p-4 sm:flex-row sm:items-start sm:gap-4',
        /*
         * No opacity on a container that holds text.
         *
         * Artboard 108 asks for "reduced opacity" on a dismissed card, and
         * opacity-[.72] delivered it — by blending every text colour toward the
         * background. Measured: --ink-2 fell to 4.3:1 and the timestamp line to
         * 2.9:1, in both themes. It was invisible for two phases because the
         * Dismissed tab is not the tab that opens by default.
         *
         * There is no opacity that fixes this. The colour tokens are tuned to
         * just clear AA at full strength (D53), so ANY alpha below 1 puts the
         * weakest of them under — the failure is arithmetic, not a bad value.
         *
         * So the de-emphasis drops and the other three signals from the same
         * artboard carry the state: the dashed border, the "Dismissed …by" line,
         * and the Restore action. The card was never distinguished by opacity
         * alone.
         */
        isDismissed ? 'border-dashed border-line' : 'border-line',
        isCompleted && 'bg-canvas-soft',
      )}
      style={
        isDismissed
          ? undefined
          : {
              borderLeft: `3px solid ${
                isCompleted ? 'var(--success)' : SEVERITY_RULE[action.severity]
              }`,
            }
      }
    >
      <Marker action={action} severity={severity} />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              'text-[14.5px] font-semibold leading-tight',
              isDismissed ? 'text-ink-2' : 'text-ink-1',
            )}
          >
            {action.title}
          </h3>

          {!isDismissed && !isCompleted ? (
            <Pill {...severity}>{SEVERITY_LABEL[action.severity]}</Pill>
          ) : null}

          {action.progress ? (
            <Pill
              bg="var(--brand-tint)"
              border="var(--brand)"
              fg="var(--brand-strong)"
            >
              In progress · {action.progress.current} of {action.progress.total}
            </Pill>
          ) : null}

          {isCompleted ? (
            <Pill bg="var(--success-surface)" border="var(--success-border)" fg="var(--success-ink)">
              Completed
            </Pill>
          ) : null}

          {isDismissed ? (
            <Pill bg="var(--canvas-soft)" border="var(--border)" fg="var(--muted-1)">
              Dismissed
            </Pill>
          ) : null}
        </div>

        {/* Dismissed cards drop the explanation but never the reason. */}
        {!isDismissed ? (
          <p className="text-small leading-relaxed text-ink-2">{action.explanation}</p>
        ) : null}

        {!isDismissed ? (
          <p className="tnum flex flex-wrap items-center gap-2 text-caption leading-relaxed text-muted-1">
            <ProvenanceBadge type={action.evidence.provenance} demo={demo} />
            <span>
              Evidence · {action.evidence.summary} · from {action.evidence.source}
            </span>
          </p>
        ) : null}

        {action.outcome ? (
          <p className="text-small text-ink-2">{action.outcome}</p>
        ) : null}

        <Timeline action={action} />
      </div>

      <Actions action={action} />
    </article>
  )
}

/** Rank number, check, or cross - shape carries the state, not just colour. */
function Marker({
  action,
  severity,
}: {
  action: Action
  severity: { bg: string; border: string; fg: string }
}) {
  if (action.status === 'COMPLETED') {
    return (
      <span
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-control border"
        style={{ background: 'var(--success-surface)', borderColor: 'var(--success-border)' }}
      >
        <Check size={14} strokeWidth={3} style={{ color: 'var(--success-ink)' }} aria-hidden />
      </span>
    )
  }

  if (action.status === 'DISMISSED') {
    return (
      <span
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-control border border-line"
        style={{ background: 'var(--canvas-soft)' }}
      >
        <X size={13} strokeWidth={2.4} style={{ color: 'var(--muted-1)' }} aria-hidden />
      </span>
    )
  }

  return (
    <span
      className="tnum flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-control border text-[12px] font-semibold"
      style={{ background: severity.bg, borderColor: severity.border, color: severity.fg }}
      aria-label={`Priority ${action.priority}`}
    >
      {action.priority}
    </span>
  )
}

/** Created / status / completed / dismissed, with actor and operation ID. */
function Timeline({ action }: { action: Action }) {
  const entries: string[] = [`Created ${formatDateTime(action.createdAt)}`]

  if (action.status === 'OPEN') entries.push('Status · open', 'Not yet actioned')

  if (action.status === 'IN_PROGRESS') {
    entries.push('Status · in progress')
    if (action.lastWorkedAt) {
      entries.push(
        `Last worked ${formatDateTime(action.lastWorkedAt)}${
          action.lastWorkedBy ? ` by ${action.lastWorkedBy}` : ''
        }`,
      )
    }
  }

  if (action.status === 'COMPLETED' && action.completedAt) {
    entries.push(
      `Completed ${formatDateTime(action.completedAt)}${
        action.completedBy ? ` by ${action.completedBy}` : ''
      }`,
    )
    if (action.operationId) entries.push(`Operation ${action.operationId}`)
  }

  if (action.status === 'DISMISSED' && action.dismissedAt) {
    entries.push(
      `Dismissed ${formatDateTime(action.dismissedAt)}${
        action.dismissedBy ? ` by ${action.dismissedBy}` : ''
      }`,
    )
    if (action.dismissedReason) entries.push(`Reason · ${action.dismissedReason}`)
  }

  return (
    <div className="tnum flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-2">
      {entries.map((e) => (
        <span key={e}>{e}</span>
      ))}
    </div>
  )
}

/**
 * Every card goes somewhere. Even a dismissed one offers Restore rather than
 * being a dead row.
 */
function Actions({ action }: { action: Action }) {
  if (action.status === 'DISMISSED') {
    return (
      <div className="shrink-0">
        <button className="w-full rounded-control border border-line px-3 py-2 text-[11.5px] font-semibold text-ink-2 hover:bg-canvas-soft sm:w-auto">
          Restore
        </button>
      </div>
    )
  }

  if (action.status === 'COMPLETED') {
    return (
      <div className="flex shrink-0 flex-col gap-1.5 sm:w-[180px]">
        <Link
          href={action.destination.href}
          className="rounded-control border border-line px-3 py-2.5 text-center text-[12px] font-semibold text-ink-2 hover:bg-surface"
        >
          {action.destination.label}
        </Link>
        {action.rollbackAvailable ? (
          <button className="rounded-control border border-line px-3 py-2 text-[11px] font-semibold text-ink-2 hover:bg-surface">
            Roll back
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:w-[180px]">
      <Link
        href={action.destination.href}
        className="rounded-control bg-brand px-3 py-2.5 text-center text-[12px] font-semibold text-brand-on hover:bg-brand-strong"
      >
        {action.destination.label}
      </Link>
      <div className="flex gap-1.5">
        <button className="flex-1 rounded-control border border-line px-2 py-2 text-[11px] font-semibold text-ink-2 hover:bg-canvas-soft">
          Snooze
        </button>
        <button className="flex-1 rounded-control border border-line px-2 py-2 text-[11px] font-semibold text-ink-2 hover:bg-canvas-soft">
          Dismiss
        </button>
      </div>
    </div>
  )
}

function Pill({
  bg,
  border,
  fg,
  children,
}: {
  bg: string
  border: string
  fg: string
  children: React.ReactNode
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-normal"
      style={{ background: bg, borderColor: border, color: fg }}
    >
      {children}
    </span>
  )
}
