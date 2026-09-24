import type { ReactNode } from 'react'
import type { Tone } from '@/domain/auth/two-factor'

/*
 * The banner every signed-out and account screen renders its outcome into.
 *
 * Extracted from auth-form.tsx rather than copied: the three tones map onto
 * the same --success / --warning / --danger surfaces the rest of the product
 * uses (D1), and a second copy of this table is a second place for a token to
 * be typed wrong. Every colour is a token; none is a literal.
 */

const TONE_STYLE: Record<Tone, { background: string; borderColor: string; color: string }> = {
  info: { background: 'var(--canvas-soft)', borderColor: 'var(--border)', color: 'var(--ink-2)' },
  warn: {
    background: 'var(--warning-surface)',
    borderColor: 'var(--warning-border)',
    color: 'var(--warning-ink)',
  },
  danger: {
    background: 'var(--danger-surface)',
    borderColor: 'var(--danger-border)',
    color: 'var(--danger-ink)',
  },
}

export function AuthNotice({
  tone,
  title,
  children,
}: {
  tone: Tone
  title: string
  children?: ReactNode
}) {
  return (
    <div
      /*
       * role="status", not role="alert". These banners render on page load
       * rather than appearing mid-interaction, and an assertive live region
       * that fires on every navigation talks over the heading a screen-reader
       * user is trying to hear.
       */
      role="status"
      className="mb-4 rounded-card border p-3.5 text-small leading-relaxed"
      style={TONE_STYLE[tone]}
    >
      <strong className="font-semibold">{title}</strong>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  )
}
