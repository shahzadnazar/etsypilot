import { Skeleton } from '@/components/ui/states'

export default function Loading() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading actions">
      <Skeleton className="mb-2 h-8 w-64" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[132px] w-full" />
      ))}
    </div>
  )
}
