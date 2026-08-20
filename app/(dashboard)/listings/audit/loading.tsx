import { Skeleton } from '@/components/ui/states'

export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-72" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
      <Skeleton className="h-[260px] w-full" />
    </div>
  )
}
