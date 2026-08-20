'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

/*
 * Foundations 04.
 *
 * Four variants, 38px on desktop and 44px on mobile. Loading states use a verb
 * ("Saving...") rather than a bare spinner, so the button still says what it is
 * doing while it is disabled.
 */

type Variant = 'primary' | 'secondary' | 'destructive' | 'quiet'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-brand text-white border border-brand hover:bg-brand-strong hover:border-brand-strong',
  secondary: 'bg-surface text-ink-2 border border-line hover:bg-canvas-soft',
  destructive: 'bg-surface text-danger border border-line hover:bg-canvas-soft',
  quiet: 'bg-transparent text-ink-2 border border-transparent hover:bg-canvas-soft',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  /** Shown in place of children while loading. Always a verb. */
  loadingLabel?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', loading = false, loadingLabel, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-control px-3.5 text-[12.5px] font-semibold',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 md:h-[38px]',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
})
