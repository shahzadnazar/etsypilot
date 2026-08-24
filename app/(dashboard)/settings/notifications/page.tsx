import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DIGEST_DAYS,
  DIGEST_DAY_LABEL,
  DIGEST_SECTIONS,
  DIGEST_SECTION_LABEL,
  getNotifications,
} from '@/domain/notifications/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Notifications' }

/*
 * Notification preferences (artboards 74–75, and the digest settings on 104).
 *
 * The event list is closed, so every notification EtsyPilot can send is on this
 * page and there is nowhere for a marketing email to appear without being named
 * here first. Each event has two independent switches, and the digest has its
 * own — nothing is opt-out-once-and-still-arrives.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { saved } = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getNotifications(ctx, session.email)
  const prefs = view.preferences

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="What EtsyPilot tells you about, and where. Every notification it can send is on this page."
      />

      {saved === '1' ? (
        <div
          role="status"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--success-surface)',
            borderColor: 'var(--success-border)',
            color: 'var(--success-ink)',
          }}
        >
          <strong className="font-semibold">Saved.</strong> {view.nextDigest.reason}
        </div>
      ) : null}

      <form method="post" action="/api/settings/notifications" className="flex flex-col gap-4">
        <Card className="p-[18px]">
          <h2 className="pb-1 text-section text-ink-1">Events</h2>
          <p className="pb-3 max-w-prose text-caption leading-relaxed text-muted-1">
            In-app appears in the bell; email goes to{' '}
            <span className="font-semibold text-ink-2">{view.email}</span>. Both are off-able
            independently, and turning one off never turns the other on.
          </p>

          <table className="w-full border-collapse text-body">
            <caption className="sr-only">
              Every notification EtsyPilot can send, with an in-app and an email switch for each.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Event
                </th>
                <th scope="col" className="px-3 py-2 text-center font-semibold">
                  In app
                </th>
                <th scope="col" className="px-3 py-2 text-center font-semibold">
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {view.events.map((event) => (
                <tr key={event.key} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-3 text-left font-normal">
                    <span className="block text-small font-medium text-ink-1">{event.label}</span>
                    <span className="mt-0.5 block max-w-prose text-caption leading-relaxed text-muted-1">
                      {event.detail}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-center">
                    <Switch
                      name={`${event.key}.inApp`}
                      label={`${event.label} in app`}
                      checked={prefs.channels[event.key].inApp}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Switch
                      name={`${event.key}.email`}
                      label={`${event.label} by email`}
                      checked={prefs.channels[event.key].email}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-[18px]">
          <h2 className="pb-1 text-section text-ink-1">Weekly digest</h2>
          <p className="pb-3 max-w-prose text-caption leading-relaxed text-muted-1">
            One email a week summarising Shop Pulse. Never marketing.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
              <span className="sr-only">Day</span>
              <select
                name="digestDay"
                defaultValue={prefs.digestDay}
                className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
              >
                {DIGEST_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {DIGEST_DAY_LABEL[day]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-caption text-muted-1">to {view.email}</span>
          </div>

          <fieldset className="mt-3">
            <legend className="pb-1.5 text-label text-muted-1">Include</legend>
            <div className="flex flex-col gap-2">
              {DIGEST_SECTIONS.map((section) => (
                <label
                  key={section}
                  className="flex items-center gap-2 text-small leading-relaxed text-ink-2"
                >
                  <input
                    type="checkbox"
                    name={`section.${section}`}
                    defaultChecked={prefs.digestSections.includes(section)}
                    className="h-6 w-6 shrink-0 accent-[color:var(--brand)]"
                  />
                  {DIGEST_SECTION_LABEL[section]}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
            {view.nextDigest.reason}
          </p>
        </Card>

        <Card className="p-[18px]">
          <h2 className="pb-1 text-section text-ink-1">Alert thresholds</h2>
          <p className="pb-3 max-w-prose text-caption leading-relaxed text-muted-1">
            Yours, not EtsyPilot&rsquo;s. The margin floor is measured against your entered costs, so
            it is only as good as those are.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              name="marginFloorPercent"
              label="Warn when net margin falls below"
              suffix="%"
              defaultValue={String(prefs.marginFloorPercent)}
              type="number"
            />
            <Field
              name="stockFloor"
              label="Notify on stock under"
              suffix="units"
              defaultValue={String(prefs.stockFloor)}
              type="number"
            />
            <Field
              name="quietHoursFrom"
              label="Quiet hours from"
              defaultValue={prefs.quietHoursFrom}
              type="time"
            />
            <Field
              name="quietHoursTo"
              label="Quiet hours to"
              defaultValue={prefs.quietHoursTo}
              type="time"
            />
          </div>
          <p className="mt-2 text-caption text-muted-1">
            Quiet hours are printed and applied in UTC, like every other time in EtsyPilot.{' '}
            <Link
              href="/settings/profile"
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              Your display time zone
            </Link>{' '}
            changes how times are shown, never when anything is sent.
          </p>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            Save preferences
          </Button>
          <span className="text-caption text-muted-1">
            Nothing here is sent to Etsy. These control EtsyPilot&rsquo;s own messages only.
          </span>
        </div>
      </form>
    </>
  )
}

function Switch({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center">
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="h-6 w-6 accent-[color:var(--brand)]"
      />
    </label>
  )
}

function Field({
  name,
  label,
  defaultValue,
  suffix,
  type,
}: {
  name: string
  label: string
  defaultValue: string
  suffix?: string
  type: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-2">{label}</span>
      <span className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          className="tnum h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
        />
        {suffix ? <span className="shrink-0 text-small text-muted-1">{suffix}</span> : null}
      </span>
    </label>
  )
}
