import { reachedLabel, type ReachedEtsy } from '@/domain/audit-log/types'

/*
 * The Reached Etsy cell (artboard 109).
 *
 * Four visual forms, and every one of them derives from the union rather than
 * from a status string:
 *
 *   Yes · 12 of 12    green      the request went and every item succeeded
 *   Partly · 8 of 9   amber      it went and some of it did not
 *   No · nothing sent outline    it meant to go and nothing did — a refusal
 *   — reason          plain text it was never going to go
 *
 * The refusal chip is deliberately an outline rather than red. Refusing is the
 * product working, not the product failing; painting it as an error would teach
 * a seller to read their own safety rails as breakage.
 */
export function ReachedChip({ reached }: { reached: ReachedEtsy }) {
  const label = reachedLabel(reached)

  if (reached.kind === 'NOT_APPLICABLE') {
    return (
      <span className="text-[11.5px] font-medium text-muted-2">
        <span aria-hidden>{label}</span>
        <span className="sr-only">Nothing was sent to Etsy — {label.replace('— ', '')}</span>
      </span>
    )
  }

  if (reached.kind === 'NOTHING_SENT') {
    return (
      <span className="inline-flex items-center rounded-full border border-muted-2 bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-2">
        {label}
      </span>
    )
  }

  const whole = reached.succeeded === reached.attempted
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={
        whole
          ? {
              background: 'var(--success-surface)',
              borderColor: 'var(--success-border)',
              color: 'var(--success-ink)',
            }
          : {
              background: 'var(--warning-surface)',
              borderColor: 'var(--warning-border)',
              color: 'var(--warning-ink)',
            }
      }
    >
      {label}
    </span>
  )
}
