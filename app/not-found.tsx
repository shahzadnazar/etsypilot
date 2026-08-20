import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="tnum text-metric text-muted-2">404</p>
      <h1 className="text-page text-ink-1">That page doesn&rsquo;t exist</h1>
      <p className="text-body text-ink-2">
        The link may be outdated, or the listing was deleted on Etsy. Nothing is broken with your
        account.
      </p>
      <div className="flex gap-2">
        <Link
          href="/dashboard"
          className="rounded-control bg-brand px-3.5 py-2.5 text-[12.5px] font-semibold text-white"
        >
          Back to overview
        </Link>
        <Link
          href="/listings"
          className="rounded-control border border-line px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-2"
        >
          Search listings
        </Link>
      </div>
    </main>
  )
}
