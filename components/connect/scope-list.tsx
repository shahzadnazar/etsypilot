/*
 * Scope chooser.
 *
 * Each scope says what it enables AND what stops working without it, so
 * declining is a decision a seller can actually make rather than a leap. The
 * Etsy scope strings are printed verbatim — the grant is inspectable, and a
 * seller who wants to check it against Etsy's own consent screen can.
 *
 * There is no password field on this component and no way to add one: the
 * ConnectionState type has nowhere to put a credential.
 */

import { Card } from '@/components/ui/card'
import { CANNOT_DO, ETSY_SCOPES, TRADEMARK_NOTICE } from '@/domain/connect/types'

const REQUIREMENT_LABEL = {
  REQUIRED: '— required',
  RECOMMENDED: '',
  OPTIONAL: '— optional',
} as const

export function ScopeList({ granted }: { granted?: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="border-b border-line p-[18px]">
          <h2 className="text-section text-ink-1">Choose what EtsyPilot can access</h2>
          <p className="mt-1 text-caption leading-relaxed text-muted-1">
            You sign in on Etsy and approve access there.{' '}
            <strong className="font-semibold text-ink-1">
              EtsyPilot never receives your Etsy password.
            </strong>{' '}
            Access is granted by Etsy and can be revoked at any time, from Settings → Data
            permissions or from your Etsy account.
          </p>
        </div>

        <ul className="flex flex-col divide-y divide-line">
          {ETSY_SCOPES.map((scope) => {
            const isGranted = granted?.some((g) => scope.scopes.includes(g))
            return (
              <li key={scope.key} className="flex flex-col gap-1.5 p-[18px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-semibold text-ink-1">{scope.label}</span>
                  {REQUIREMENT_LABEL[scope.requirement] ? (
                    <span className="text-caption text-muted-1">
                      {REQUIREMENT_LABEL[scope.requirement]}
                    </span>
                  ) : null}
                  {granted ? (
                    <span className="ml-auto text-caption text-muted-1">
                      {isGranted ? 'Granted' : 'Not granted'}
                    </span>
                  ) : null}
                </div>
                <p className="text-small leading-relaxed text-ink-2">{scope.enables}</p>
                <p className="text-caption leading-relaxed text-muted-1">
                  Without it: {scope.withoutIt}
                </p>
                <p className="text-caption text-muted-1">
                  Scopes: <code className="font-mono">{scope.scopes.join(', ')}</code>
                </p>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="p-[18px]">
        <h3 className="text-section text-ink-1">What EtsyPilot can’t do</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {CANNOT_DO.map((line) => (
            <li key={line} className="text-small leading-relaxed text-ink-2">
              · {line}
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-caption leading-relaxed text-muted-1">{TRADEMARK_NOTICE}</p>
    </div>
  )
}
