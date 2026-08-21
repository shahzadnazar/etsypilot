import { AlertTriangle, Ban, Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ValidationSummary } from '@/domain/bulk-editor/types'

/*
 * Validation results (artboard 41).
 *
 * Three groups, and the copy for each says what happens next rather than only
 * how many. Blocked items are excluded automatically, so the seller is told
 * that rather than left to infer it.
 */
export function ValidationSummaryPanel({ summary }: { summary: ValidationSummary }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<Check size={14} strokeWidth={3} aria-hidden />}
          label="Ready"
          count={summary.ready}
          bg="var(--success-surface)"
          border="var(--success-border)"
          fg="var(--success-ink)"
        />
        <Tile
          icon={<AlertTriangle size={14} strokeWidth={2.4} aria-hidden />}
          label="Warnings"
          count={summary.warnings}
          bg="var(--warning-surface)"
          border="var(--warning-border)"
          fg="var(--warning-ink)"
        />
        <Tile
          icon={<Ban size={14} strokeWidth={2.4} aria-hidden />}
          label="Blocked"
          count={summary.blocked}
          bg="var(--danger-surface)"
          border="var(--danger-border)"
          fg="var(--danger-ink)"
        />
      </div>

      {summary.groups.length > 0 ? (
        <Card className="flex flex-col divide-y divide-line">
          {summary.groups.map((g) => (
            <div key={g.code} className="flex flex-col gap-1 p-[18px]">
              <span className="text-small font-semibold text-ink-1">
                <span className="tnum">{g.count}</span> listing{g.count === 1 ? '' : 's'} —{' '}
                {g.message}
              </span>
              {g.remedy ? <span className="text-caption text-muted-1">{g.remedy}</span> : null}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-[18px] text-small text-ink-2">
          Nothing is blocked and nothing needs attention. Blocked listings are excluded
          automatically and listed in the error report.
        </Card>
      )}
    </div>
  )
}

function Tile({
  icon,
  label,
  count,
  bg,
  border,
  fg,
}: {
  icon: React.ReactNode
  label: string
  count: number
  bg: string
  border: string
  fg: string
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-[14px]">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: bg, borderColor: border, color: fg }}
      >
        {icon}
        {label}
      </span>
      <span className="tnum mt-2 block text-metric text-ink-1">{count}</span>
    </div>
  )
}
