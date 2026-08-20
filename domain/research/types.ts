/*
 * Research domain types.
 *
 * A keyword list is the join between research and editing: terms are saved
 * while researching and applied to listings later through the bulk editor, with
 * a reviewable diff. The list itself never writes anything - it produces a
 * bulk-editor operation, which then goes through validate / diff / confirm like
 * every other write (D-gate, Phase 4).
 */

export interface KeywordList {
  id: string
  shopId: string
  name: string
  terms: string[]
  createdAt: string
  updatedAt: string
  /** Non-null only once multi-user ships (D20). The seam, not the feature. */
  sharedWith: string | null
}

export interface KeywordListSummary {
  id: string
  name: string
  termCount: number
  preview: string[]
  updatedAt: string
  sharedWith: string | null
}

export function summarise(list: KeywordList): KeywordListSummary {
  return {
    id: list.id,
    name: list.name,
    termCount: list.terms.length,
    preview: list.terms.slice(0, 2),
    updatedAt: list.updatedAt,
    sharedWith: list.sharedWith,
  }
}
