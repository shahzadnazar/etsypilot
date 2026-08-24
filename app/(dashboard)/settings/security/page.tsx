import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { getSecurityView, type SecurityEventOutcome } from '@/domain/security/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDateTime, formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Security' }

const OUTCOME_STYLE: Record<SecurityEventOutcome, { bg: string; border: string; fg: string }> = {
  SUCCEEDED: {
    bg: 'var(--success-surface)',
    border: 'var(--success-border)',
    fg: 'var(--success-ink)',
  },
  FAILED: { bg: 'var(--danger-surface)', border: 'var(--danger-border)', fg: 'var(--danger-ink)' },
  INFORMATIONAL: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--ink-2)' },
}

const OUTCOME_LABEL: Record<SecurityEventOutcome, string> = {
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  INFORMATIONAL: 'Recorded',
}

/*
 * Security (artboard 111).
 *
 * The failed sign-in is visible on purpose. A security page that lists only
 * successful sign-ins is the same defect as an audit log that records only
 * successful writes: it cannot answer the question anybody comes to it with.
 */
export default async function SecurityPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getSecurityView(ctx)

  return (
    <>
      <PageHeader
        title="Security"
        subtitle="Access to your EtsyPilot account. Your Etsy shop is connected by token — EtsyPilot never holds your Etsy password."
      />

      <div
        className="mb-4 rounded-card border p-4 text-small leading-relaxed"
        style={{
          background: 'var(--warning-surface)',
          borderColor: 'var(--warning-border)',
          color: 'var(--warning-ink)',
        }}
      >
        <strong className="font-semibold">Account sign-in is not connected yet.</strong> Everything
        below is a true description of this account, and the controls that would change it are
        disabled rather than pretending. The one thing you can act on today is the Etsy connection,
        which you revoke from{' '}
        <Link
          href="/settings/shops"
          className="font-semibold underline underline-offset-2"
          style={{ color: 'inherit' }}
        >
          Shop connections
        </Link>{' '}
        or from Etsy itself.
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-[18px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-section text-ink-1">Password</span>
            <span className="text-caption text-muted-1">
              Last changed {formatDate(`${view.passwordChangedOn}T12:00:00.000Z`)}
            </span>
          </div>
          <NotYet label="Change" reason="Arrives with accounts. No password is stored yet." />
        </Card>

        <Card className="flex flex-wrap items-start justify-between gap-3 p-[18px]">
          <div className="flex max-w-prose flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-section text-ink-1">Two-step verification</span>
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                style={
                  view.twoStepEnabled
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
                {view.twoStepEnabled ? 'On' : 'Off'}
              </span>
            </span>
            <span className="text-caption leading-relaxed text-muted-1">
              An authenticator app code in addition to your password. Recommended —{' '}
              <strong className="font-semibold text-ink-2">
                this account can change live listings.
              </strong>
            </span>
          </div>
          <NotYet
            label={view.twoStepEnabled ? 'Turn off' : 'Turn on'}
            variant={view.twoStepEnabled ? 'secondary' : 'primary'}
            reason="Arrives with accounts, alongside sign-in."
          />
        </Card>

        {view.googleConnectedAs ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-[18px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-section text-ink-1">Google sign-in</span>
              <span className="text-caption text-muted-1">
                Connected as {view.googleConnectedAs}
              </span>
            </div>
            <NotYet label="Disconnect" reason="Arrives with accounts." />
          </Card>
        ) : null}

        <Card className="flex flex-col gap-3 p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section text-ink-1">Active sessions</h2>
            <NotYet
              label="Sign out everywhere else"
              reason="Arrives with accounts. Nothing here would be signed out today."
            />
          </div>
          <ul className="flex flex-col">
            {view.sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink-1">
                    {s.label}
                    {s.current ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                        This device
                      </span>
                    ) : null}
                    {s.readOnly ? (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: 'var(--canvas-soft)',
                          borderColor: 'var(--border)',
                          color: 'var(--ink-2)',
                        }}
                      >
                        Read-only
                      </span>
                    ) : null}
                  </span>
                  <span className="tnum text-caption text-muted-1">
                    {s.detail} · {s.location} · {formatRelative(s.lastSeen, new Date(view.now))}
                  </span>
                </div>
                {s.current ? (
                  <span className="text-caption text-muted-1">Signed in now</span>
                ) : (
                  <NotYet
                    label={s.kind === 'EXTENSION' ? 'Revoke' : 'Sign out'}
                    reason="Arrives with accounts."
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="max-w-prose text-caption leading-relaxed text-muted-1">
            The extension is listed here because it has access, even though it holds no Etsy
            credential and cannot write anything.{' '}
            <Link
              href="/settings/extension"
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              What the extension can and cannot do
            </Link>
            .
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">Recent security activity</h2>
          <ul className="flex flex-col">
            {view.events.map((event) => {
              const style = OUTCOME_STYLE[event.outcome]
              return (
                <li
                  key={`${event.at}-${event.label}`}
                  className="flex flex-wrap items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0"
                >
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: style.bg, borderColor: style.border, color: style.fg }}
                  >
                    {OUTCOME_LABEL[event.outcome]}
                  </span>
                  <span className="min-w-0 flex-1 text-small text-ink-1">{event.label}</span>
                  <span className="tnum text-caption text-muted-1">
                    {formatDateTime(event.at)}
                  </span>
                </li>
              )
            })}
          </ul>
          <Link
            href="/settings/audit-log"
            className="text-caption font-semibold text-brand-strong underline underline-offset-2"
          >
            See everything in the audit log →
          </Link>
        </Card>

        {/*
          * The closing note, and the most important paragraph on the page. A
          * seller who thinks EtsyPilot holds their Etsy password cannot reason
          * about their own exposure — and the answer is better than they fear.
          */}
        <Card className="flex flex-col gap-2 p-[18px]">
          <h2 className="text-section text-ink-1">Your Etsy password is never involved</h2>
          <p className="max-w-prose text-small leading-relaxed text-ink-2">
            The shop connection is an OAuth token you granted and can revoke from{' '}
            <Link
              href="/settings/shops"
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              Shop connections
            </Link>{' '}
            or from Etsy itself. Revoking it stops all reads and writes immediately.
          </p>
          <p className="max-w-prose text-caption leading-relaxed text-muted-1">
            {view.etsyConnection.canWrite
              ? 'This connection can write to your listings, and every write goes through confirmation first.'
              : 'This connection cannot write to your listings at all. Every attempted write is refused and recorded in the audit log.'}
          </p>
        </Card>
      </div>
    </>
  )
}
