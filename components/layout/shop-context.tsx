import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'

/*
 * Shop context in the top bar (D22 consequence 6).
 *
 * With one shop this is no longer a switcher: the dropdown affordance and the
 * "Manage shops" link are gone. The element keeps its place because it still
 * carries the two things that matter on every screen - which shop, and how
 * fresh the data is.
 *
 * ── THE DOT AND THE BORDER ASK "IS THERE A LIVE ETSY LINK" ────────────────
 *
 * The original note here said it exactly: the chip goes dashed "rather than
 * showing a green 'connected' dot that would imply a live Etsy link". That is
 * a question about the SHOP ROW — has this shop connected — so it is keyed on
 * `connected`, in both modes. A live-mode shop that has never connected gets
 * the same dashed, muted treatment, which is what it has always deserved.
 *
 * The "· demo" suffix is a different question: is the data fictional. That is
 * the MODE. Both were driven by `session.isDemo`, so a real seller's real
 * placeholder shop was labelled demo.
 */
export function ShopContext({
  shopName,
  lastSyncedAt,
  demoData,
  connected,
  now,
}: {
  shopName: string
  lastSyncedAt: string | null
  /** ETSY_MODE: the fictional catalogue is being served. Drives "· demo". */
  demoData: boolean
  /** !shops.is_demo: this shop has an Etsy connection. Drives the dot. */
  connected: boolean
  now?: Date
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 whitespace-nowrap rounded-control border px-3 py-2 text-[12.5px] font-semibold text-ink-2',
          connected ? 'border-solid border-line' : 'border-dashed',
        )}
        style={connected ? undefined : { borderColor: 'var(--muted-2)' }}
      >
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: connected ? 'var(--success)' : 'var(--muted-2)' }}
          aria-hidden
        />
        <span className="truncate">{shopName}</span>
        {/*
          * "· demo" only where the data IS the demo catalogue. A live shop
          * that has not connected is not a demo shop, and saying so beside a
          * name read from its own row made one screen give one shop two
          * identities.
          */}
        {demoData ? (
          <span className="shrink-0 font-medium text-muted-1">· demo</span>
        ) : !connected ? (
          <span className="shrink-0 font-medium text-muted-1">· not connected</span>
        ) : null}
      </span>

      <span className="tnum hidden text-caption text-muted-1 sm:inline">
        {/*
          * Three answers, not two. "Static data · no sync" is true of the demo
          * catalogue — it is a fixture and nothing syncs it — and false of a
          * live shop with nothing in it, where there is no data at all rather
          * than static data. That state now says what it is.
          */}
        {demoData
          ? 'Static data · no sync'
          : lastSyncedAt
            ? `Synced ${formatRelative(lastSyncedAt, now)}`
            : connected
              ? 'Not yet synced'
              : 'No data yet'}
      </span>
    </div>
  )
}
