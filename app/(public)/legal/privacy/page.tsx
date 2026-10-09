import type { Metadata } from 'next'
import { DocumentView } from '@/components/legal/document-view'
import { legalDocument, legalDocumentsInForce } from '@/lib/legal/documents'

export async function generateMetadata(): Promise<Metadata> {
  const document = legalDocument('privacy')
  return {
    title: document.title,
    description: 'What EtsyPilot collects, why, how long it keeps it, and how to get it back.',
    /*
     * An unfinished policy should not be the search result somebody finds
     * when they look for how EtsyPilot handles their data. It stays reachable
     * by URL — see components/legal/draft-notice.tsx for why a 404 would be
     * dishonest — but it is not advertised while it names no controller.
     */
    ...(legalDocumentsInForce() ? {} : { robots: { index: false, follow: false } }),
  }
}

export default function PrivacyPage() {
  return <DocumentView document={legalDocument('privacy')} />
}
