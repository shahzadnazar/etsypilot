/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHOSE TERMS THE NO-TRAINING SENTENCE RESTS ON, AND WHEN THEY WERE READ.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Terms §6 and Privacy §3 both say:
 *
 *     "We do not use your shop data or your content to train artificial
 *      intelligence models."
 *
 * and Privacy §3 goes one step further than our own conduct:
 *
 *     "Where you ask for an AI draft, the listing text is sent to our AI
 *      provider to produce it; that provider does not train on it either."
 *
 * The first sentence is about this product and is enforced in code —
 * tests/unit/no-training.test.ts holds it. THE SECOND IS A CLAIM ABOUT
 * SOMEBODY ELSE'S TERMS, and no amount of code can make it true. A guard that
 * pretended to check it would be worse than no guard, because it would make
 * the sentence look checked.
 *
 * So the second sentence is made VISIBLE instead. This record sits beside the
 * adapter it describes, carries the provider and the document the sentence
 * relies on, and is rendered on /data/sources. The guard's job is narrow and
 * useful: the provider named here must be the provider the adapter actually
 * talks to. Swap the SDK and this file is a compile-and-test failure until
 * somebody reads the new provider's terms and writes down what they found —
 * which is the only failure mode that matters, because a provider change is
 * exactly when a sentence like this goes stale and nobody notices.
 *
 * ── WHAT IS RECORDED HERE AND WHAT IS NOT ─────────────────────────────────
 *
 * Recorded: the provider, the SDK that reaches it, the document the claim
 * rests on and its address, what the product relies on that document to say,
 * and the date this record was written.
 *
 * NOT recorded: a quotation. The clause is not reproduced below, because
 * nobody has pasted it in from the document itself and a paraphrase sitting in
 * quotation marks is the kind of thing that becomes evidence by accident.
 * `clauseRecordedBy` says who checked and is deliberately the string below
 * until a person replaces it.
 */

/** The SDK the live adapter imports. The guard ties this to lib/ai/claude.ts. */
export const AI_PROVIDER_SDK = '@anthropic-ai/sdk'

export interface AiProviderTerms {
  /** As the Privacy Policy's sub-processor table must name it. */
  provider: string
  /** The npm package the adapter reaches the provider through. */
  sdk: string
  /** The document the no-training sentence rests on. */
  document: string
  url: string
  /** What the product relies on that document to say. Our words, not theirs. */
  reliedOnFor: string
  /** ISO date this record was written or last revised. */
  recordedOn: string
  /**
   * Who read the clause in the document itself.
   *
   * NOT_YET_READ_BY_A_PERSON until somebody does. /data/sources renders the
   * difference, so a seller and a reviewer can both see which of the two
   * sentences in Privacy §3 is enforced and which is relied upon.
   */
  clauseRecordedBy: string
}

export const AI_PROVIDER_TERMS: AiProviderTerms = {
  provider: 'Anthropic, PBC',
  sdk: AI_PROVIDER_SDK,
  document: 'Anthropic Commercial Terms of Service',
  url: 'https://www.anthropic.com/legal/commercial-terms',
  reliedOnFor:
    'that content sent through the commercial API is not used to train Anthropic’s models',
  recordedOn: '2026-10-13',
  clauseRecordedBy: 'NOT_YET_READ_BY_A_PERSON',
}

/** True once a person has recorded reading the clause in the document. */
export function providerClauseWasRead(): boolean {
  return AI_PROVIDER_TERMS.clauseRecordedBy !== 'NOT_YET_READ_BY_A_PERSON'
}

/**
 * One line for a surface that reports on sources.
 *
 * Says which document the claim rests on and whether a person has checked it.
 * "Recorded" and "verified" are different words on purpose.
 */
export function providerTermsNote(): string {
  const base = `${AI_PROVIDER_TERMS.provider} · no-training relied on from its ${AI_PROVIDER_TERMS.document}, recorded ${AI_PROVIDER_TERMS.recordedOn}`
  return providerClauseWasRead()
    ? `${base}, clause read by ${AI_PROVIDER_TERMS.clauseRecordedBy}`
    : `${base}. The clause itself has not been read into this record yet, so this half of the promise is relied upon rather than checked.`
}
