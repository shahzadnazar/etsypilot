/*
 * Research service.
 *
 * Assembles the Keyword Explorer from modelled signals, and turns a keyword
 * list into a bulk-editor draft.
 *
 * Note what this file does NOT do: it never writes to a listing. "Apply to
 * listings" produces a DRAFT operation and hands it to the bulk editor, which
 * validates, diffs and requires an explicit confirmation before anything is
 * published. There is one write path in this product and research does not get
 * a second one.
 */

import { getEtsyService } from '@/lib/etsy'
import { getSignalsService } from '@/lib/signals'
import type { KeywordSignals, RelatedTerm } from '@/lib/signals/interface'
import type { ShopContext } from '@/lib/permissions'
import { createDraft } from '@/domain/bulk-editor/service'
import type { BulkOperation } from '@/domain/bulk-editor/types'
import { type KeywordList, type KeywordListSummary, summarise } from './types'

export const DEFAULT_MARKET = 'United States'
export const DEFAULT_TERM = 'birth flower necklace'

export interface KeywordView {
  signals: KeywordSignals
  related: RelatedTerm[]
  /** Terms already saved to a list, so the UI does not offer to save twice. */
  savedTerms: string[]
  lists: KeywordListSummary[]
}

export async function getKeywordView(
  ctx: ShopContext,
  term: string,
  market = DEFAULT_MARKET,
): Promise<KeywordView> {
  const signals = getSignalsService()
  const [keyword, related] = await Promise.all([
    signals.getKeyword(term, market),
    signals.getRelated(term, market),
  ])
  const lists = demoLists(ctx.shopId)

  return {
    signals: keyword,
    related,
    savedTerms: [...new Set(lists.flatMap((l) => l.terms))],
    lists: lists.map(summarise),
  }
}

/**
 * Turn a saved list into a bulk-editor draft.
 *
 * The returned operation is a DRAFT. It has no confirmation, so it cannot be
 * applied; the caller has to take it through the same wizard as any other bulk
 * change. That is the point — a keyword list is research until a human reviews
 * the diff it produces.
 */
export function applyListToListings(args: {
  ctx: ShopContext
  list: KeywordList
  listings: Parameters<typeof createDraft>[0]['listings']
  now: string
  operationId: string
}): BulkOperation {
  return createDraft({
    id: args.operationId,
    ctx: args.ctx,
    changes: [{ kind: 'TAGS', mode: 'ADD', tags: args.list.terms }],
    listings: args.listings,
    now: args.now,
  })
}

export async function getListsView(ctx: ShopContext): Promise<KeywordListSummary[]> {
  // Reads the shop's own listings only to confirm the shop exists in this
  // context; the lists themselves are shop-scoped by construction.
  await getEtsyService().getShop(ctx.shopId)
  return demoLists(ctx.shopId).map(summarise)
}

export function findList(shopId: string, id: string): KeywordList | null {
  return demoLists(shopId).find((l) => l.id === id) ?? null
}

/* --------------------------------------------------------------- demo data */

const LIST_UPDATED = '2026-08-18T09:12:00.000Z'

export function demoLists(shopId: string): KeywordList[] {
  return [
    {
      id: 'list-autumn-gifting',
      shopId,
      name: 'Autumn gifting',
      terms: [
        'birth flower necklace',
        'personalized gift mom',
        'birth month jewelry',
        'dainty flower charm',
        'gold filled necklace',
        'autumn gift for her',
        'october birth flower',
        'personalized birth flower necklace',
      ],
      createdAt: '2026-07-02T10:00:00.000Z',
      updatedAt: LIST_UPDATED,
      sharedWith: null,
    },
    {
      id: 'list-wedding-2027',
      shopId,
      name: 'Wedding season 2027',
      terms: [
        'bridesmaid gift set',
        'wedding welcome sign',
        'editable seating chart',
        'bridal party jewelry',
      ],
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-08-11T15:40:00.000Z',
      // The seam for D20, visible in the design, inert until multi-user ships.
      sharedWith: null,
    },
  ]
}
