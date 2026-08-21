import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { FeeCalculator } from '@/components/tools/fee-calculator'

export const metadata: Metadata = { title: 'Fee Calculator' }

export default function FeeCalculatorPage() {
  return (
    <>
      <PageHeader
        title="Fee Calculator"
        subtitle="What Etsy takes from a sale, worked out line by line against published rates. No shop needed."
      />
      <FeeCalculator />
    </>
  )
}
