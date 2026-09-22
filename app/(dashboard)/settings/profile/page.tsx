import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getProfile } from '@/domain/profile/service'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Profile' }

/*
 * Profile (artboard 110).
 *
 * Deliberately small. Name, log display name, verified email, language, display
 * time zone — and nothing else, because everything a seller expects to find
 * here that is actually about the SHOP lives under Shops & data.
 *
 * The one paragraph that matters is the time zone note. D24 made UTC the single
 * basis for every calculation in the product, which opens an obvious door: a
 * seller changes a display setting and assumes their figures moved with it. The
 * note closes it, next to the setting that would have opened it.
 *
 * Language and time zone are stated rather than offered. There is one language
 * and one display zone today, and a select listing four of them that changed
 * nothing would be the dishonest kind of control — the same reason Export &
 * deletion carries no delete button.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { saved, problem } = await searchParams
  const profile = await getProfile(session)

  const initials = profile.fullName
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="How you appear in the audit log and how EtsyPilot addresses you. None of this is sent to Etsy."
      />

      {problem === 'NAME' ? (
        <div
          role="alert"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--danger-surface)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger-ink)',
          }}
        >
          <strong className="font-semibold">Your name cannot be blank.</strong> The display name is
          what appears beside every action in the audit log, so it has to be something. Nothing was
          changed.
        </div>
      ) : saved === '1' ? (
        <div
          role="status"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--success-surface)',
            borderColor: 'var(--success-border)',
            color: 'var(--success-ink)',
          }}
        >
          <strong className="font-semibold">Saved.</strong> New audit records will carry this name.
          Records already written keep the name you had then — they cannot be edited.
        </div>
      ) : null}

      <form method="post" action="/api/settings/profile">
        <Card className="flex flex-col gap-5 p-[18px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-brand-on">
              {initials}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-section text-ink-1">{profile.fullName}</span>
              <span className="text-caption text-muted-1">Owner · joined May 2026</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-2">Full name</span>
              <input
                name="fullName"
                defaultValue={profile.fullName}
                maxLength={80}
                className="h-11 rounded-control border border-line bg-surface px-2.5 text-body text-ink-1 outline-none focus:border-brand md:h-[38px]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-2">
                Display name in the log
              </span>
              <input
                name="displayName"
                defaultValue={profile.displayName}
                maxLength={80}
                className="h-11 rounded-control border border-line bg-surface px-2.5 text-body text-ink-1 outline-none focus:border-brand md:h-[38px]"
              />
              <span className="text-caption leading-relaxed text-muted-1">
                The name beside every action in the{' '}
                <Link
                  href="/settings/audit-log"
                  className="font-semibold text-brand-strong underline underline-offset-2"
                >
                  audit log
                </Link>
                .
              </span>
            </label>

            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-caption font-semibold text-ink-2">Email</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body text-ink-1">{profile.email}</span>
                {profile.emailVerified ? (
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: 'var(--success-surface)',
                      borderColor: 'var(--success-border)',
                      color: 'var(--success-ink)',
                    }}
                  >
                    Verified
                  </span>
                ) : null}
              </span>
              <span className="text-caption leading-relaxed text-muted-1">
                Used for sign-in, the weekly digest and billing receipts. Changing it needs
                confirmation from both addresses, so it is done from{' '}
                <Link
                  href="/settings/security"
                  className="font-semibold text-brand-strong underline underline-offset-2"
                >
                  Security
                </Link>{' '}
                rather than here.
              </span>
            </div>

            <Stated
              label="Language"
              value={profile.language}
              note="One language today. When there are more, this becomes a choice."
            />
            <Stated
              label="Time zone for display"
              value={profile.timeZone}
              note="Every time in EtsyPilot is printed in UTC. A per-account display zone is not offered yet, and a control that changed nothing would be worse than saying so."
            />
          </div>

          {/*
            * The sentence that closes the door D24 opened. It sits with the
            * setting rather than in Methodology, because the misreading it
            * prevents happens at the moment somebody looks at a time zone
            * control and assumes their figures follow it.
            */}
          <p className="max-w-prose rounded-card border border-line bg-canvas-soft p-3 text-caption leading-relaxed text-ink-2">
            Every figure in EtsyPilot is calculated in UTC, including period boundaries and daily
            buckets. A display time zone changes how times are printed, never how numbers are
            computed.{' '}
            <Link
              href="/data/methodology"
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              How the figures are produced
            </Link>
            .
          </p>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary">
              Save changes
            </Button>
            <Link
              href="/settings/profile"
              className="inline-flex h-11 items-center rounded-control px-3.5 text-[12.5px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Discard
            </Link>
          </div>
        </Card>
      </form>

      <Card
        className="mt-5 flex flex-col gap-2 p-[18px]"
        style={{ borderColor: 'var(--danger-border)' }}
      >
        <h2 className="text-section" style={{ color: 'var(--danger-ink)' }}>
          Delete account
        </h2>
        <p className="max-w-prose text-small leading-relaxed text-ink-2">
          Removes your account, your shop&rsquo;s synced data and your cost inputs.{' '}
          <strong className="font-semibold">Your Etsy shop is untouched.</strong> Audit records of
          who requested the deletion are kept.
        </p>
        <p className="max-w-prose text-small leading-relaxed text-ink-2">
          {/*
            * No delete button, for the same reason Export & deletion has none:
            * there is no repository behind it yet, and a control that looks
            * like it deletes your account while doing nothing is the single
            * worst thing this page could contain.
            */}
          Deletion is handled from{' '}
          <Link
            href="/settings/export"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Data export &amp; deletion
          </Link>
          , which explains exactly what is removed and what is kept, and offers the export you
          should take first.
        </p>
      </Card>
    </>
  )
}

function Stated({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-2">{label}</span>
      <span className="text-body text-ink-1">{value}</span>
      <span className="text-caption leading-relaxed text-muted-1">{note}</span>
    </div>
  )
}
