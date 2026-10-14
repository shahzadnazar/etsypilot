import type { Metadata } from 'next'
import Link from 'next/link'
import { Markdown } from '@/lib/markdown/render'
import { legalDocument, legalDocumentsInForce } from '@/lib/legal/documents'
import { warrantyDisclaimer } from '@/lib/legal/etsy'
import { DocumentDate } from '@/components/legal/document-date'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Etsy, and what this app is',
    description:
      'CobaltRank’s relationship to Etsy, Inc.: the trademark, the warranty disclaimer, the OAuth connection, and what runs where.',
    ...(legalDocumentsInForce() ? {} : { robots: { index: false, follow: false } }),
  }
}

export default function EtsyRelationshipPage() {
  const terms = legalDocument('terms')
  const privacy = legalDocument('privacy')

  return (
    <article className="doc">
      <header className="mb-7 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-[30px] leading-[1.12]" style={{ color: 'var(--ink-1)' }}>
          Etsy, and what this app is
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted-1)' }}>
          Who provides CobaltRank, how it reaches your shop, and what runs where.
        </p>
        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--muted-1)' }}>
          {/*
            * Both documents, because this page draws on both: section 12 of
            * the Terms for the disclaimer, and sections 5 and 7 of the Privacy
            * Policy for the OAuth connection and how long Etsy content is
            * kept.
            */}
          <DocumentDate documents={[terms, privacy]} />
        </p>
      </header>

      <h2 id="not-etsy">CobaltRank is not Etsy</h2>
      <p>
        CobaltRank is an independent application built by a third-party developer. It is not made by,
        run by, endorsed by, certified by or affiliated with Etsy, Inc. The term &ldquo;Etsy&rdquo;
        is a trademark of Etsy, Inc., used here to say which marketplace this application works
        with.
      </p>

      <h2 id="warranty">Warranty disclaimer</h2>
      <p>
        Etsy&rsquo;s API Terms of Use require an application to carry a disclaimer naming its
        developer as the sole provider. This is section 12 of the{' '}
        <Link href={terms.href}>Terms of Service</Link>, quoted from that document rather than
        retyped here, so the two cannot drift apart:
      </p>
      <Markdown source={`> ${warrantyDisclaimer()}`} />
      <p>
        While the legal entity behind CobaltRank is still being established, the name of that
        provider is a blank in the sentence above. It is marked rather than guessed.
      </p>

      <h2 id="connection">How CobaltRank reaches your shop</h2>
      <p>
        Through Etsy&rsquo;s official API, under an OAuth token you grant on etsy.com. Specifically:
      </p>
      <ul>
        <li>
          <strong>Your Etsy password is never asked for, received or stored.</strong> You type it on
          etsy.com. There is no field anywhere in CobaltRank that could receive one.
        </li>
        <li>
          <strong>You can revoke the token at any time from your Etsy account</strong>, under Account
          settings → Apps. Revoking takes effect immediately and stops CobaltRank reading or writing
          anything.
        </li>
        <li>
          <strong>There is no Disconnect button inside CobaltRank yet.</strong> The button on Settings
          → Shop connections is deliberately disabled rather than made to look like it works, and it
          points at Etsy instead.
        </li>
        <li>
          Revoking does not delete what has already been synced. Export it, or ask for it to be
          deleted, from Settings → Export &amp; deletion.
        </li>
        <li>
          The token is stored encrypted on the server. It is never sent to a browser, and nothing
          that runs in one can reach it.
        </li>
      </ul>

      <h2 id="scraping">Scraping</h2>
      <p>
        Etsy&rsquo;s API Terms of Use restrict the use of automated systems to access, analyse or
        scrape Etsy data other than through the API. The provision&rsquo;s own wording governs; the
        sentence above is a summary of it and not a quotation.
      </p>
      <p>
        CobaltRank obtains <strong>every piece of Etsy data through Etsy&rsquo;s official API</strong>,
        server-side, under the OAuth token the seller granted. Nothing in this product reads a page
        on etsy.com, nothing of it runs against Etsy&rsquo;s site, and there is no crawler, no
        sampler and no scheduler: a read that finds its copy outside Etsy&rsquo;s display window is
        the only thing that causes a request, so a shop nobody opens costs no Etsy requests at all.
      </p>

      <h2 id="elsewhere">Where the rest of this is written down</h2>
      <ul>
        <li>
          <Link href="/legal/terms">Terms of Service</Link> — section 4 covers connecting your
          shop, and section 12 carries the disclaimer above.
        </li>
        <li>
          <Link href="/legal/privacy">Privacy Policy</Link> — section 7 covers the OAuth
          connection, and section 5 covers how long Etsy content is kept.
        </li>
        <li>
          <Link href="/legal/subprocessors">Sub-processors</Link> — Etsy, Inc. is listed as the
          source of your shop data, under your authorisation.
        </li>
      </ul>
    </article>
  )
}
