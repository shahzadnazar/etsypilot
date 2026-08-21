'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SimpleCalculator } from './simple-calculator'
import { Card } from '@/components/ui/card'

/*
 * The public wrapper.
 *
 * Its whole job is the timing of one line. The sign-up invitation appears only
 * after the seller has a result in front of them — before that the page has
 * given them nothing, and asking first is the pattern this product does not
 * use.
 *
 * It is an invitation, not a gate: the calculator above keeps working whether
 * or not anyone clicks it, and there is no dismissal to remember because
 * nothing is blocked.
 */
export function PublicCalculator() {
  const [hasResult, setHasResult] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <SimpleCalculator onResult={setHasResult} />

      {hasResult ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-small leading-relaxed text-ink-2">
            Want this against your real Etsy fees and confirmed costs? EtsyPilot works from your own
            receipts.
          </span>
          <Link
            href="/onboarding"
            className="inline-flex h-11 shrink-0 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
          >
            Create a free account
          </Link>
        </Card>
      ) : null}
    </div>
  )
}
