import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { ProductProfit } from '@/components/tools/profit-calculator'

export const metadata: Metadata = { title: 'Profit Calculator' }

export default function Page() {
  return (
    <>
      <PageHeader title="Profit Calculator" subtitle="One product, end to end — price, fees, materials, postage and your time. No shop needed." />
      <ProductProfit />
    </>
  )
}
