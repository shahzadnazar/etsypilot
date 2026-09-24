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

/**
 * The card's heading.
 *
 * `as` because the LEVEL is the page's business and the SIZE is this
 * component's. A card inside a page whose only other heading is the h1 needs
 * an h2; hard-coding h3 here would have made every operator section skip a
 * level to adopt the shared component, which is a worse outcome than the
 * hand-rolled heading it replaced.
 *
 * The size is overridable through className because cn() is tailwind-merge:
 * the operator sections pass `text-small` and keep the 13px they have today,
 * rather than every section title on six screens growing to 15px as a side
 * effect of a refactor nobody asked to change the design.
 */
export function CardTitle({
  className,
  as: Tag = 'h3',
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <Tag className={cn('text-[15px] font-semibold leading-none text-ink-1', className)} {...rest} />
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-[18px]', className)} {...rest} />
}
