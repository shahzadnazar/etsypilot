import type { ReactNode } from 'react'

/*
 * Page header.
 *
 * The subtitle always states period, shop and currency where the page reports
 * figures - "all figures in USD" is not decoration, it is part of the claim.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-page tracking-[-0.015em] text-ink-1">{title}</h1>
        {subtitle ? <p className="text-small text-muted-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
