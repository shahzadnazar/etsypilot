import { Skeleton } from '@/components/ui/states'

/*
 * The managers list: a header, then one wide table.
 *
 * SHAPED LIKE THE PAGE, not a generic bar. A placeholder whose outline matches
 * what arrives is the difference between a screen that is loading and a screen
 * that is about to rearrange itself under the reader's eye — and the operator
 * console had none at all, so every screen showed a blank frame and then
 * snapped in.
 *
 * aria-busy and a label, so a screen reader is told it is waiting rather than
 * told nothing. Every Skeleton is aria-hidden, so without the label on the
 * wrapper this announces as an empty region.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-prose" />
      <Skeleton className="mt-2 h-[320px] w-full" />
    </div>
  )
}
