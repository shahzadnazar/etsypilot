/*
 * AI activity across every shop, as data.
 *
 * Pure: no database, no `server-only`, no React.
 *
 * ── COUNTS AND STATES. NEVER THE TEXT. ────────────────────────────────────
 *
 * `ai_generations.input` and `.output` hold a seller's own listing copy —
 * their titles, their descriptions, the words they sell with. Reading it is
 * permitted by the read-only rule and it is still not read, for a reason that
 * has nothing to do with permission: an operator does not need somebody's
 * product descriptions to understand volume or cost, and a screen that
 * displays them makes reading a seller's copy a routine sight rather than a
 * deliberate act.
 *
 * That is a design decision rather than an access-control one, so it is
 * enforced where design decisions erode — in the query shape and in a guard
 * that reads the SELECT. Neither this module nor the screen has a field the
 * text could arrive in.
 *
 * ── WHAT "COST" CAN HONESTLY MEAN HERE ────────────────────────────────────
 *
 * Nothing in this schema records money or tokens against a generation. There
 * is no price column, no token count, no model name. So this screen reports
 * VOLUME — which is what drives the cost — and says that it is reporting
 * volume, rather than multiplying a count by a rate somebody typed in. A
 * figure invented to look complete is worse than an absent one (D34).
 */

import { calculated, unavailable } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'

/**
 * The four kinds of generation.
 *
 * Copied from the schema's own comment on `ai_generations.kind` and checked
 * against it by a test that reads the file, so the two cannot drift.
 */
export const GENERATION_KINDS = ['TITLE', 'TAGS', 'DESCRIPTION', 'EXPLANATION'] as const
export type GenerationKind = (typeof GENERATION_KINDS)[number]

/**
 * The three states.
 *
 * There is no failure state, and that absence is load-bearing elsewhere: a
 * generation that failed leaves no row, so a count of rows never includes one
 * (D37, and the usage screen depends on it).
 */
export const GENERATION_STATUSES = ['DRAFT', 'ACCEPTED', 'REJECTED'] as const
export type GenerationStatus = (typeof GENERATION_STATUSES)[number]

export const KIND_LABEL: Record<GenerationKind, string> = {
  TITLE: 'Titles',
  TAGS: 'Tags',
  DESCRIPTION: 'Descriptions',
  EXPLANATION: 'Explanations',
}

export const STATUS_LABEL: Record<GenerationStatus, string> = {
  DRAFT: 'Drafted, not yet decided',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
}

/** One bucket of the grouped count, as the repository returns it. */
export interface GenerationTally {
  shopId: string
  kind: string
  status: string
  count: number
}

export interface ShopActivity {
  shopId: string
  shopName: string
  ownerEmail: string | null
  isDemo: boolean
  total: number
  byKind: Record<GenerationKind, number>
  byStatus: Record<GenerationStatus, number>
  /** Rows whose kind or status the code does not recognise. Should be zero. */
  unrecognised: number
  acceptance: Provenanced<number>
}

function emptyKinds(): Record<GenerationKind, number> {
  return { TITLE: 0, TAGS: 0, DESCRIPTION: 0, EXPLANATION: 0 }
}

function emptyStatuses(): Record<GenerationStatus, number> {
  return { DRAFT: 0, ACCEPTED: 0, REJECTED: 0 }
}

/**
 * The acceptance rate, with the provenance that produced it.
 *
 * ── DRAFTS ARE NOT IN THE DENOMINATOR ─────────────────────────────────────
 *
 * A DRAFT is undecided. Counting it as "not accepted" would report a shop that
 * generated fifty drafts this morning as having a 0% acceptance rate, which is
 * a claim about the AI's quality made out of the seller not having got to them
 * yet. The rate is over DECIDED generations, and the share of generations that
 * have been decided travels with it as `coverage` — so a rate computed over
 * three of two hundred says so rather than looking like a verdict.
 *
 * UNAVAILABLE, not zero, when nothing has been decided. A shop with only
 * drafts has no acceptance rate; rendering 0% would be the single most
 * misleading number this screen could carry.
 */
export function acceptanceRate(byStatus: Record<GenerationStatus, number>): Provenanced<number> {
  const decided = byStatus.ACCEPTED + byStatus.REJECTED
  const total = decided + byStatus.DRAFT

  if (decided === 0) {
    return unavailable(
      total === 0
        ? 'No generations, so there is nothing to have accepted or rejected.'
        : 'Every generation is still a draft, so none has been accepted or rejected yet.',
      'The rate appears once a seller has decided on at least one draft.',
    )
  }

  const rate = Math.round((byStatus.ACCEPTED / decided) * 1000) / 10
  const coverage = total === 0 ? 0 : Math.round((decided / total) * 100)

  return calculated(rate, 'Accepted as a share of generations the seller has decided on.', {
    coverage,
    ...(coverage < 100
      ? {
          limitations: [
            `${byStatus.DRAFT} of ${total} generations are still drafts and are excluded. Counting an undecided draft as a rejection would report the seller not having got to it as a verdict on the AI.`,
          ],
        }
      : {}),
  })
}

/** Fold the grouped counts into one row per shop. */
export function summariseByShop(
  tallies: readonly GenerationTally[],
  shops: readonly { shopId: string; shopName: string; ownerEmail: string | null; isDemo: boolean }[],
): ShopActivity[] {
  const byShop = new Map<string, ShopActivity>()

  for (const shop of shops) {
    byShop.set(shop.shopId, {
      ...shop,
      total: 0,
      byKind: emptyKinds(),
      byStatus: emptyStatuses(),
      unrecognised: 0,
      acceptance: acceptanceRate(emptyStatuses()),
    })
  }

  for (const tally of tallies) {
    const entry = byShop.get(tally.shopId)
    if (!entry) continue
    entry.total += tally.count

    const kind = (GENERATION_KINDS as readonly string[]).includes(tally.kind)
      ? (tally.kind as GenerationKind)
      : null
    const status = (GENERATION_STATUSES as readonly string[]).includes(tally.status)
      ? (tally.status as GenerationStatus)
      : null

    if (kind) entry.byKind[kind] += tally.count
    if (status) entry.byStatus[status] += tally.count
    /*
     * A row the code does not recognise is counted, not dropped. Silently
     * discarding it would make the per-kind figures add up to less than the
     * total with nothing on screen to explain the gap — and the gap is the
     * finding.
     */
    if (!kind || !status) entry.unrecognised += tally.count
  }

  for (const entry of byShop.values()) {
    entry.acceptance = acceptanceRate(entry.byStatus)
  }

  return [...byShop.values()].sort((a, b) => b.total - a.total || a.shopName.localeCompare(b.shopName))
}

export interface PlatformTotals {
  total: number
  byKind: Record<GenerationKind, number>
  byStatus: Record<GenerationStatus, number>
  unrecognised: number
  acceptance: Provenanced<number>
  /** Shops that have generated anything at all this period. */
  activeShops: number
}

export function platformTotals(activity: readonly ShopActivity[]): PlatformTotals {
  const byKind = emptyKinds()
  const byStatus = emptyStatuses()
  let total = 0
  let unrecognised = 0

  for (const shop of activity) {
    total += shop.total
    unrecognised += shop.unrecognised
    for (const kind of GENERATION_KINDS) byKind[kind] += shop.byKind[kind]
    for (const status of GENERATION_STATUSES) byStatus[status] += shop.byStatus[status]
  }

  return {
    total,
    byKind,
    byStatus,
    unrecognised,
    acceptance: acceptanceRate(byStatus),
    activeShops: activity.filter((shop) => shop.total > 0).length,
  }
}

/**
 * What the volume figure is, and what it is not.
 *
 * Exported so the page renders the caveat from the same place the figure is
 * computed, rather than as a sentence somebody remembered to write next to it.
 */
export const COST_STATEMENT =
  'Volume, not money. Nothing in this product records a price, a token count or a model against a generation, so there is no cost figure to show — and multiplying a count by a rate typed in here would be a number that looks precise and is invented.'
