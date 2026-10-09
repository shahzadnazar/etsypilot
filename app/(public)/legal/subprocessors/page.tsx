import type { Metadata } from 'next'
import Link from 'next/link'
import { legalDocument, legalDocumentsInForce } from '@/lib/legal/documents'
import { subProcessors } from '@/lib/legal/subprocessors'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Sub-processors',
    description: 'Every third party that processes data for EtsyPilot, and the ones not yet in use.',
    ...(legalDocumentsInForce() ? {} : { robots: { index: false, follow: false } }),
  }
}

export default function SubProcessorsPage() {
  const rows = subProcessors()
  const privacy = legalDocument('privacy')
  const named = rows.filter((row) => row.status === 'NAMED')
  const unnamed = rows.filter((row) => row.status === 'IN_USE_UNNAMED')
  const dormant = rows.filter((row) => row.status === 'NOT_IN_USE')

  return (
    <article className="doc">
      <header className="mb-7 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-[30px] leading-[1.12]" style={{ color: 'var(--ink-1)' }}>
          Sub-processors
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted-1)' }}>
          This page is section 4 of the{' '}
          <Link href={privacy.href}>Privacy Policy</Link>, rendered from the same text.{' '}
          <span className="mono">version {privacy.contentHash.slice(0, 12)}</span>
        </p>
      </header>

      <p>
        A sub-processor is a company that processes your data on EtsyPilot&rsquo;s behalf. The list
        below is the whole of it. Adding one is an edit to the Privacy Policy, so this page and that
        document cannot disagree.
      </p>

      <h2 id="in-use">Named, and in use today</h2>
      <p>
        These receive data now, and the Privacy Policy names them.
        &ldquo;Receives&rdquo; means exactly what the row says — Anthropic receives a
        listing&rsquo;s title and tags when you ask for a draft, and nothing when you do not.
      </p>
      <div className="legal-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Who</th>
              <th scope="col">What they do</th>
              <th scope="col">Where</th>
            </tr>
          </thead>
          <tbody>
            {named.map((row) => (
              <tr key={row.who}>
                <td>
                  <strong>{row.who}</strong>
                </td>
                <td>{row.what}</td>
                <td>{row.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unnamed.length > 0 ? (
        <>
          <h2 id="in-use-unnamed">In use, and not yet named</h2>
          <p>
            {/*
              * The state the first version of this page got wrong. It marked
              * every unnamed role "not in use", which put the database and the
              * authentication provider — live on every single request — under
              * a heading saying nothing was sent to them. Telling a reader
              * that nothing processes their data when something does is worse
              * than the over-claim this page exists to avoid.
              */}
            These roles are <strong>live</strong>. Data is being processed through them today, and
            the Privacy Policy has not named the company yet. That is a gap in the document, not a
            gap in the processing: UK and EU data protection law requires each processor to be
            named, and this will be named here and in the policy before EtsyPilot launches.
          </p>
          <div className="legal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">What it does</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {unnamed.map((row) => (
                  <tr key={row.who}>
                    <td>{row.who}</td>
                    <td>
                      {row.what}
                      <br />
                      <span style={{ color: 'var(--muted-1)' }}>{row.because}</span>
                    </td>
                    <td>
                      <span className="legal-placeholder" data-kind="blank" role="note">
                        In use — provider not yet named
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {dormant.length > 0 ? (
        <>
          <h2 id="not-in-use">Not in use</h2>
          <p>
            {/*
              * The instruction this page was built to: anything not yet wired
              * up is marked "not in use" rather than listed as a fact. A
              * payment provider row presented as live would state that a
              * payment is taken, and none is — there is no payment provider
              * in this product, which is also why no trial can start.
              */}
            These roles exist in the Privacy Policy because they will be needed, and nothing is
            connected to them. <strong>Nothing is sent to any of them.</strong> Whether each one is
            connected is read from this deployment&rsquo;s own configuration as the page is served —
            the same check the product uses to decide whether it may send email or take a payment —
            so a row cannot sit here claiming to be dormant once it is switched on. Each will be
            named here, and in the Privacy Policy, before it processes anything, which is the notice
            section 4 promises.
          </p>
          <div className="legal-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">What it would do</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {dormant.map((row) => (
                  <tr key={row.who}>
                    <td>{row.who}</td>
                    <td>
                      {row.what}
                      <br />
                      <span style={{ color: 'var(--muted-1)' }}>{row.because}</span>
                    </td>
                    <td>
                      <span className="legal-placeholder" data-kind="blank" role="note">
                        Not in use — no provider chosen
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2 id="telemetry">Analytics, error reporting and email</h2>
      <p>
        None of the three is connected. EtsyPilot&rsquo;s analytics, error-reporting and email
        adapters are inert in this build, so there are no analytics cookies, no third-party
        trackers, and no transactional email — which is why a card-required free trial cannot be
        started here at all: the trial promises an email before it ends, and that promise is
        enforced in code rather than written down.
      </p>
    </article>
  )
}
