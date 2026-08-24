import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getConnectionState } from '@/domain/connect/service'
import { ETSY_SCOPES } from '@/domain/connect/types'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Data permissions' }

/*
 * Data permissions (artboards 72–73).
 *
 * What each permission granted on Etsy actually enables, and what stops working
 * if it is revoked. The second half is the part worth having: a permissions
 * screen that only lists what it can do is asking for consent without stating
 * the cost of withholding it.
 *
 * Whether a scope is granted is read from the SHOP, not written down here. The
 * connect screen, this page and the OAuth request all read ETSY_SCOPES, so
 * three surfaces cannot describe different permissions.
 */
export default async function DataPermissionsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const state = await getConnectionState(ctx)
  const granted = new Set(state.grantedScopes)

  return (
    <>
      <PageHeader
        title="Data permissions"
        subtitle={
          state.shopName
            ? `${state.shopName} · what EtsyPilot can reach, and what stops if you take it away`
            : 'What EtsyPilot can reach once a shop is connected'
        }
        actions={
          <Link
            href="/settings/shops"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Shop connections
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        {ETSY_SCOPES.map((scope) => {
          /*
           * Granted is measured against the shop's own scope list. It used to be
           * tempting to render every scope as granted on a connected shop —
           * which would show "Inventory updates: granted" for a permission the
           * seller deliberately did not give.
           */
          const isGranted = scope.scopes.every((s) => granted.has(s))
          return (
            <Card key={scope.key} className="flex flex-col gap-2 p-[18px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-section text-ink-1">{scope.label}</h2>
                  <span className="tnum text-caption text-muted-2">
                    {scope.scopes.join(' · ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      isGranted
                        ? {
                            background: 'var(--success-surface)',
                            borderColor: 'var(--success-border)',
                            color: 'var(--success-ink)',
                          }
                        : {
                            background: 'var(--canvas-soft)',
                            borderColor: 'var(--border)',
                            color: 'var(--muted-1)',
                          }
                    }
                  >
                    {isGranted ? 'Granted' : 'Not granted'}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-[0.06em]',
                      scope.requirement === 'REQUIRED' ? 'text-brand-strong' : 'text-muted-2',
                    )}
                  >
                    {scope.requirement.toLowerCase()}
                  </span>
                </div>
              </div>

              <p className="max-w-prose text-small leading-relaxed text-ink-2">{scope.enables}</p>
              <p className="max-w-prose text-caption leading-relaxed text-muted-1">
                <strong className="font-semibold">Without it:</strong> {scope.withoutIt}
              </p>
            </Card>
          )
        })}
      </div>

      <Card className="mt-4 flex flex-col gap-2 p-[18px]">
        <h2 className="text-label text-muted-1">How access works</h2>
        <p className="max-w-prose text-small leading-relaxed text-ink-2">
          Access is granted by Etsy, not by a password. EtsyPilot never asks for, receives or stores
          your Etsy credentials — the connection is an OAuth token you granted and can revoke, from{' '}
          <Link
            href="/settings/shops"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Shop connections
          </Link>{' '}
          or from Etsy itself. Revoking stops all reads and writes immediately.
        </p>
        <p className="max-w-prose text-caption leading-relaxed text-muted-1">
          Revoking a permission does not delete what has already been synced.{' '}
          <Link
            href="/settings/export"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Data export &amp; deletion
          </Link>{' '}
          is where you remove it, and{' '}
          <Link
            href="/settings/audit-log"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            the audit log
          </Link>{' '}
          records every action taken while the permission was held — including the ones that were
          refused.
        </p>
      </Card>
    </>
  )
}
