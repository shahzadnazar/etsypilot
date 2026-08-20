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
 * In demo mode the chip goes dashed and says so, rather than showing a green
 * "connected" dot that would imply a live Etsy link (artboard 103b).
 */
export function ShopContext({
  shopName,
  lastSyncedAt,
  isDemo,
  now,
}: {
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  now?: Date
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          'flex min-w-0 items-center gap-2 whitespace-nowrap rounded-control border px-3 py-2 text-[12.5px] font-semibold text-ink-2',
          isDemo ? 'border-dashed' : 'border-solid border-line',
        )}
        style={isDemo ? { borderColor: 'var(--muted-2)' } : undefined}
      >
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: isDemo ? 'var(--muted-2)' : 'var(--success)' }}
          aria-hidden
        />
        <span className="truncate">{shopName}</span>
        {isDemo ? (
          <span className="shrink-0 font-medium text-muted-1">· demo</span>
        ) : null}
      </span>

      <span className="tnum hidden text-caption text-muted-1 sm:inline">
        {isDemo
          ? 'Static data · no sync'
          : lastSyncedAt
            ? `Synced ${formatRelative(lastSyncedAt, now)}`
            : 'Not yet synced'}
      </span>
    </div>
  )
}
