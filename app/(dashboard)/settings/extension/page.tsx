import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getSession } from '@/lib/auth'
import { CANNOT_DO, TRADEMARK_NOTICE } from '@/domain/connect/types'

export const metadata: Metadata = { title: 'Browser Extension' }

/*
 * Settings → Browser Extension.
 *
 * Neither store listing is live, so both store buttons stay disabled — a button
 * that looks installable and is not is the "must not look built" problem D21
 * removed from the navigation.
 *
 * But the page used to stop there, which made it a dead end for something that
 * is finished and installable today: the package builds, it passes its own
 * audit, and loading it unpacked takes four steps. "Not in a store yet" and
 * "you cannot have it" are different sentences, and the page was printing the
 * second while meaning the first.
 *
 * The security section is the load-bearing part of this screen: it states what
 * the extension can never do, and every line of it is enforced by the packaging
 * audit rather than by this page's good intentions.
 */
const STORES = [
  {
    key: 'chrome',
    name: 'Chrome',
    status: 'Not in the Web Store yet',
    steps: [
      'Download the package below and unzip it.',
      'Open chrome://extensions and turn on Developer mode.',
      'Choose “Load unpacked” and pick the unzipped folder.',
      'Open any etsy.com listing and click the EtsyPilot icon.',
    ],
  },
  {
    key: 'firefox',
    name: 'Firefox',
    status: 'Not on addons.mozilla.org yet',
    steps: [
      'Download the package below and unzip it.',
      'Open about:debugging → This Firefox.',
      'Choose “Load Temporary Add-on” and pick manifest.json inside the folder.',
      'Open any etsy.com listing and click the EtsyPilot icon.',
    ],
  },
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

      <section aria-label="Install" className="grid gap-3 lg:grid-cols-2">
        {STORES.map((store) => (
          <Card key={store.key} className="flex flex-col gap-2 p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section text-ink-1">{store.name}</h2>
              <span className="text-caption text-muted-2">{store.status}</span>
            </div>
            <p className="text-caption text-muted-1">
              Manifest V3, same UI and same API client on both browsers.
            </p>

            <ol className="mt-1 flex flex-col gap-1.5">
              {store.steps.map((step, index) => (
                <li key={step} className="flex gap-2 text-small leading-relaxed text-ink-2">
                  <span className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[10px] font-semibold text-brand-strong">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {/*
              * A real link to a real file, not a store button that does nothing.
              * The route zips the BUILD output — the artefact the packaging
              * audit ran against — so what a seller loads is what was checked.
              */}
            <Link
              prefetch={false}
              href={`/api/extension/download/${store.key}`}
              className="mt-2 inline-flex h-11 w-fit items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Download for {store.name}
            </Link>
          </Card>
        ))}
      </section>

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        The extension is finished; it is only the store listings that are not. Loading it unpacked
        gives you exactly the package a store listing would, and this page will link to the listings
        instead once they are live. If the download reports that nothing has been packaged, run{' '}
        <code className="font-mono">npm run extension:build</code> once — the build is what runs the
        audit below, and a package that has not been through it is not one we hand out.
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
