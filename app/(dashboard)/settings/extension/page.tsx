import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getSession } from '@/lib/auth'
import { CANNOT_DO, TRADEMARK_NOTICE } from '@/domain/connect/types'

export const metadata: Metadata = { title: 'Browser Extension' }

/*
 * Settings → Browser Extension.
 *
 * Both store buttons are disabled and say "Coming Soon", because neither
 * listing is live. A button that looks installable and is not is the same
 * "must not look built" problem D21 removed from the navigation, and the design
 * is explicit that these stay disabled until the stores go live.
 *
 * The security section is the load-bearing part of this screen: it states what
 * the extension can never do, and every line of it is enforced by the packaging
 * audit rather than by this page's good intentions.
 */
const STORES = [
  { key: 'chrome', name: 'Chrome', status: 'Coming soon' },
  { key: 'firefox', name: 'Firefox', status: 'Coming soon' },
] as const

const NEVER = [
  'Store or expose Etsy API keys or secrets in the browser',
  'Ask for your Etsy password',
  'Edit, publish or deactivate listings automatically',
  'Claim data it cannot actually access',
] as const

const CAN = [
  'Show listing health and the open findings for a listing you own',
  'Show keyword opportunity and competition, modelled from public signals',
  'Show your own verified figures for your own listings',
  'Open the matching screen in EtsyPilot',
] as const

export default async function ExtensionSettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <>
      <PageHeader
        title="Browser Extension"
        subtitle="EtsyPilot intelligence while you browse Etsy. Read-only, on etsy.com only."
      />

      <section aria-label="Install" className="grid gap-3 sm:grid-cols-2">
        {STORES.map((store) => (
          <Card key={store.key} className="flex flex-col gap-2 p-[18px]">
            <h2 className="text-section text-ink-1">{store.name}</h2>
            <p className="text-caption text-muted-1">
              Manifest V3, same UI and same API client on both browsers.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="mt-2 h-11 cursor-not-allowed rounded-control border border-line px-3 text-[12px] font-semibold text-muted-1 md:h-[38px]"
            >
              {store.status}
            </button>
          </Card>
        ))}
      </section>

      <p className="mt-3 text-caption leading-relaxed text-muted-1">
        Not yet published to either store, so both buttons stay disabled. When a listing goes live
        this page links to it — nothing here installs anything today.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2 p-[18px]">
          <h2 className="text-section text-ink-1">What it can do</h2>
          <ul className="flex flex-col gap-1.5">
            {CAN.map((line) => (
              <li key={line} className="text-small leading-relaxed text-ink-2">
                · {line}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-2 p-[18px]">
          <h2 className="text-section text-ink-1">What it can never do</h2>
          <ul className="flex flex-col gap-1.5">
            {NEVER.map((line) => (
              <li key={line} className="text-small leading-relaxed text-ink-2">
                · {line}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-caption leading-relaxed text-muted-1">
            It authenticates with your EtsyPilot account only — it never sees your Etsy password,
            and Etsy API secrets stay server-side. Each of these is checked when the extension is
            packaged: a build that requests a permission beyond etsy.com, uses a cookie or
            web-request API, or contains anything shaped like a key, fails and is never produced.
          </p>
        </Card>
      </div>

      <Card className="mt-4 flex flex-col gap-2 p-[18px]">
        <h2 className="text-section text-ink-1">Permissions it requests</h2>
        <ul className="flex flex-col gap-1.5 text-small leading-relaxed text-ink-2">
          <li>
            · <code className="font-mono">activeTab</code> — reads the address of the Etsy tab you
            have open, when you click the icon.
          </li>
          <li>
            · <code className="font-mono">https://www.etsy.com/*</code> — so the panel can tell
            which listing you are looking at. Nothing runs on any other site.
          </li>
        </ul>
        <p className="text-caption leading-relaxed text-muted-1">
          It does not read the Etsy page itself. Prices, titles and stock taken off Etsy&rsquo;s
          markup would be data we present as ours, from a page that changes without notice — every
          figure in the panel comes from EtsyPilot, with the same badge it carries here.
        </p>
      </Card>

      <Card className="mt-4 flex flex-col gap-2 p-[18px]">
        <h2 className="text-section text-ink-1">The same limits as the app</h2>
        <ul className="flex flex-col gap-1.5">
          {CANNOT_DO.map((line) => (
            <li key={line} className="text-small leading-relaxed text-ink-2">
              · {line}
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-4 text-caption leading-relaxed text-muted-1">{TRADEMARK_NOTICE}</p>
    </>
  )
}
