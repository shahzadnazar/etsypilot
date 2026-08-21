import { Skeleton } from '@/components/ui/states'

/*
 * The loading state for saved keyword lists.
 *
 * Every page under (dashboard) reads a session and is therefore rendered per
 * request (D47), so each one has a server round trip a seller waits through.
 * Six of nineteen had a loading.tsx; the rest showed the previous page until
 * the new one arrived, which reads as a click that did nothing.
 *
 * aria-busy and a label, because a screen reader gets no "the page is greyer
 * now" cue — without them this is silence.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading saved keyword lists">
      <Skeleton className="mb-2 h-8 w-72" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[180px] w-full" />
        ))}
      </div>
    </div>
  )
}
