import type { Metadata } from 'next'
import { DocumentView } from '@/components/legal/document-view'
import { legalDocument, legalDocumentsInForce } from '@/lib/legal/documents'

export async function generateMetadata(): Promise<Metadata> {
  const document = legalDocument('terms')
  return {
    title: document.title,
    description: 'The agreement between you and EtsyPilot.',
    /*
     * An unfinished agreement should not be the search result somebody finds
     * when they look for EtsyPilot's terms. It stays reachable by URL — see
     * components/legal/draft-notice.tsx for why a 404 would be dishonest —
     * but it is not advertised while it has blanks in it.
     */
    ...(legalDocumentsInForce() ? {} : { robots: { index: false, follow: false } }),
  }
}

export default function TermsPage() {
  return <DocumentView document={legalDocument('terms')} />
}
