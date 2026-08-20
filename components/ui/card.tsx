import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

/*
 * Foundations 05.
 *
 * 1px border, 12px radius, white surface, and NO shadow. Elevation is reserved
 * for overlays - cards and tables never carry it. That single rule is most of
 * what keeps this from reading as a generic SaaS dashboard.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface', className)}
      {...rest}
    />
  )
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 p-[18px] pb-0', className)} {...rest} />
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold leading-none text-ink-1', className)} {...rest} />
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-[18px]', className)} {...rest} />
}
