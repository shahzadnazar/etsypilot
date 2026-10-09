import { draftState } from '@/lib/legal/documents'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT A VISITOR SEES AT /legal/terms WHILE THE DOCUMENT IS UNFINISHED.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The choice was between a 404 and a visible draft state, and it is not close.
 *
 * A 404 says the document does not exist. It does exist: it is in the
 * repository, it has been verified against the code claim by claim, and it is
 * what the product intends to be bound by. Answering "not found" to somebody
 * who went looking for the terms — a seller deciding whether to connect their
 * shop, an Etsy reviewer checking an API application — is a false statement
 * made by a server, and it is the kind that reads as evasion rather than as
 * work in progress.
 *
 * A soft 404 would be worse still: the document would be unreachable AND the
 * reader would be told nothing about why.
 *
 * So the page renders, in full, with this banner above it. The reader gets the
 * text, the date, and the blanks marked exactly where they are, which is
 * strictly more than any of the alternatives tells them. What they do NOT get
 * is a document presented as being in force, an accept button, or a link from
 * a public surface pointing them here as though it were settled:
 *
 *   - the footer and the signup form link here only once the blanks are filled
 *     (lib/legal/documents.ts: legalDocumentsInForce)
 *   - the acceptance flow refuses to run at all while any blank remains
 *     (domain/legal/acceptance.ts: assertTermsOfferable)
 *   - these pages ask search engines not to index them while in draft
 *
 * Reachable by typing the URL, honest about its state, and not presented as an
 * agreement. That is the whole position.
 */
export function DraftNotice() {
  const { isDraft, placeholders, confirmCount } = draftState()
  if (!isDraft) return null

  return (
    <aside
      /*
       * `role="note"` and not `role="alert"`: an alert interrupts a screen
       * reader mid-sentence, and this is context for the document rather than
       * a response to something the reader just did.
       */
      role="note"
      aria-labelledby="legal-draft-heading"
      className="mb-6 rounded-[4px] border p-4"
      style={{
        borderColor: 'var(--danger-border)',
        background: 'var(--danger-surface)',
      }}
    >
      <h2
        id="legal-draft-heading"
        className="display text-[16px]"
        style={{ color: 'var(--danger-ink)' }}
      >
        Draft. Not in force, and not an agreement you can accept yet.
      </h2>
      <p
        className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--danger-ink)' }}
      >
        These documents are published here in full so you can read what EtsyPilot intends to be
        bound by. They are not finished: the legal entity behind EtsyPilot has not been established
        yet, so every clause naming it still has a blank in it. Each blank is marked in the text
        below rather than hidden.
      </p>
      <p
        className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--danger-ink)' }}
      >
        Nothing here is being presented to you for acceptance. No seller is asked to accept these
        terms while they are in this state — connecting an Etsy shop is blocked rather than allowed
        on an unfinished agreement — and they are not linked from the site's footer until they are
        finished.
      </p>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--danger-ink)' }}>
        <span className="mono">
          {placeholders.length} unfilled {placeholders.length === 1 ? 'placeholder' : 'placeholders'}
          {confirmCount > 0
            ? ` · ${confirmCount} unresolved ${confirmCount === 1 ? 'note' : 'notes'}`
            : ''}
        </span>
      </p>
    </aside>
  )
}
