import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { AdsRoi } from '@/components/tools/ads-roi'

export const metadata: Metadata = { title: 'Ads ROI Calculator' }

export default function Page() {
  return (
    <>
      <PageHeader title="Ads ROI Calculator" subtitle="Spend against attributed revenue, from your own figures. Etsy does not publish Ads performance through its API." />
      <AdsRoi />
    </>
  )
}
