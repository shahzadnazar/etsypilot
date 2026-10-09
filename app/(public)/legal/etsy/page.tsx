import type { Metadata } from 'next'
import Link from 'next/link'
import { Markdown } from '@/lib/markdown/render'
import { legalDocument, legalDocumentsInForce } from '@/lib/legal/documents'
import { extensionFacts, warrantyDisclaimer } from '@/lib/legal/etsy'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Etsy, and what this app is',
    description:
      'EtsyPilot’s relationship to Etsy, Inc.: the trademark, the warranty disclaimer, the OAuth connection, and exactly what the browser extension reads.',
    ...(legalDocumentsInForce() ? {} : { robots: { index: false, follow: false } }),
  }
}

export default function EtsyRelationshipPage() {
  const facts = extensionFacts()
  const terms = legalDocument('terms')

  return (
    <article className="doc">
      <header className="mb-7 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-[30px] leading-[1.12]" style={{ color: 'var(--ink-1)' }}>
          Etsy, and what this app is
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted-1)' }}>
          Who provides EtsyPilot, how it reaches your shop, and what the browser extension reads.
        </p>
      </header>

      <h2 id="not-etsy">EtsyPilot is not Etsy</h2>
      <p>
        EtsyPilot is an independent application built by a third-party developer. It is not made by,
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
        While the legal entity behind EtsyPilot is still being established, the name of that
        provider is a blank in the sentence above. It is marked rather than guessed.
      </p>

      <h2 id="connection">How EtsyPilot reaches your shop</h2>
      <p>
        Through Etsy&rsquo;s official API, under an OAuth token you grant on etsy.com. Specifically:
      </p>
      <ul>
        <li>
          <strong>Your Etsy password is never asked for, received or stored.</strong> You type it on
          etsy.com. There is no field anywhere in EtsyPilot that could receive one.
        </li>
        <li>
          <strong>You can revoke the token at any time from your Etsy account</strong>, under Account
          settings → Apps. Revoking takes effect immediately and stops EtsyPilot reading or writing
          anything.
        </li>
        <li>
          <strong>There is no Disconnect button inside EtsyPilot yet.</strong> The button on Settings
          → Shop connections is deliberately disabled rather than made to look like it works, and it
          points at Etsy instead.
        </li>
        <li>
          Revoking does not delete what has already been synced. Export it, or ask for it to be
          deleted, from Settings → Export &amp; deletion.
        </li>
        <li>
          The token is stored encrypted on the server. It is never sent to a browser, and never
          reaches the extension.
        </li>
      </ul>

      <h2 id="extension">The browser extension, and exactly what it reads</h2>
      <p>
        EtsyPilot offers an optional browser extension, downloadable from Settings → Extension by a
        signed-in seller. It is not required, and nothing in the product depends on it.
      </p>
      <p>
        <strong>This section is deliberately specific.</strong> An earlier draft of the Terms said
        EtsyPilot used no browser extension at all. That was wrong — one ships with the product —
        and it was found by reading the code rather than the prose. So what follows is read out of
        the extension&rsquo;s own manifest and source, not written from memory:
      </p>

      <h3 id="extension-does">What it does</h3>
      <ul>
        <li>
          On an Etsy page you have already opened, it reads{' '}
          <strong>the address in your address bar</strong>, takes the listing id out of it, and sends
          that id — and nothing else — to EtsyPilot at{' '}
          <code>{facts.appEndpoint}</code>.
        </li>
        <li>
          EtsyPilot answers with <strong>your own figures for your own listing</strong>, which the
          server already holds, having read them from Etsy&rsquo;s API under your OAuth token. Those
          figures are shown in the extension&rsquo;s popup.
        </li>
        <li>
          It authenticates as you by your existing EtsyPilot session cookie, which the browser
          sends. The extension holds no token, no key and no credential of any kind — neither
          EtsyPilot&rsquo;s nor Etsy&rsquo;s.
        </li>
      </ul>

      <h3 id="extension-does-not">What it does not do</h3>
      <ul>
        <li>
          <strong>It does not read the content of any Etsy page.</strong> No titles, no prices, no
          stock levels, no search results, no other seller&rsquo;s listing — it does not touch the
          page&rsquo;s markup at all.
        </li>
        <li>
          <strong>It does not read your Etsy cookies, storage, headers or session</strong>, and it
          holds no permission that would let it.
        </li>
        <li>
          <strong>It does not change anything on any Etsy page.</strong> Nothing is injected,
          rewritten, hidden or overlaid.
        </li>
        <li>
          <strong>It never calls etsy.com.</strong> Its only network destination is the EtsyPilot
          application. Every figure it shows came from Etsy&rsquo;s official API, server-side, under
          your grant.
        </li>
        <li>
          <strong>It runs on no site other than Etsy</strong>, and only while you are on it.
        </li>
      </ul>

      <h3 id="extension-permissions">The permissions it asks your browser for</h3>
      <p>
        Read from <code>extension/manifest.chrome.json</code> as this page was served, so this list
        is the extension&rsquo;s actual request rather than a description of it:
      </p>
      <div className="legal-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Manifest field</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>permissions</td>
              <td>
                <code>{facts.permissions.join(', ') || 'none'}</code>
              </td>
            </tr>
            <tr>
              <td>host_permissions</td>
              <td>
                <code>{facts.hostPermissions.join(', ') || 'none'}</code>
              </td>
            </tr>
            <tr>
              <td>content script runs on</td>
              <td>
                <code>{facts.contentScriptMatches.join(', ') || 'nothing'}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="scraping">Scraping, and Etsy&rsquo;s rules about extensions</h2>
      <p>
        Etsy&rsquo;s API Terms of Use restrict the use of automated systems to access, analyse or
        scrape Etsy data other than through the API, and item 24 of their Prohibited Behavior list
        names browser extensions explicitly. The provision&rsquo;s own wording governs; the sentence
        above is a summary of it and not a quotation.
      </p>
      <p>
        EtsyPilot obtains <strong>every piece of Etsy data through Etsy&rsquo;s official API</strong>,
        server-side, under the OAuth token the seller granted. The extension is not a second route
        to Etsy data: it reads no Etsy page content, calls no Etsy endpoint, and the only thing it
        sends anywhere is a listing id taken from the address of a page the seller had already
        opened.
      </p>
      <p>
        <strong>What EtsyPilot does not claim here</strong> is that Etsy has reviewed or authorised
        the extension. It has not been submitted to Etsy, and no written authorisation has been
        given or asked for. Whether reading a listing id out of a URL counts as &ldquo;accessing
        Etsy data&rdquo; for the purposes of that rule is Etsy&rsquo;s call, not ours, and this page
        describes the behaviour precisely rather than asserting a conclusion about it. If Etsy says
        the extension falls the wrong side of that line, the extension is withdrawn — nothing in the
        product depends on it.
      </p>

      <h2 id="elsewhere">Where the rest of this is written down</h2>
      <ul>
        <li>
          <Link href="/legal/terms">Terms of Service</Link> — section 4 covers connecting your shop,
          including the same extension description, and section 12 carries the disclaimer above.
        </li>
        <li>
          <Link href="/legal/privacy">Privacy Policy</Link> — section 2 lists what the extension
          collects, section 7 covers the OAuth connection, and section 5 covers how long Etsy content
          is kept.
        </li>
        <li>
          <Link href="/legal/subprocessors">Sub-processors</Link> — Etsy, Inc. is listed as the
          source of your shop data, under your authorisation.
        </li>
      </ul>
    </article>
  )
}
