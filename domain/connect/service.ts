/*
 * Connection and onboarding state.
 *
 * Demo mode reports CONNECTED with a demo shop, because the whole product has
 * to be walkable without credentials. The sync screen is reachable on its own
 * so the staged progress — not an indefinite spinner — can be reviewed and
 * tested before Phase 11 makes it real.
 */

import { getEtsyService, isDemoMode } from '@/lib/etsy'
import { DEMO_LAST_SYNCED } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import {
  ETSY_SCOPES,
  overallPercent,
  selectedScopeStrings,
  type ConnectionState,
  type SyncStage,
  type SyncState,
} from './types'

export async function getConnectionState(ctx: ShopContext): Promise<ConnectionState> {
  const shop = await getEtsyService().getShop(ctx.shopId)

  return {
    step: 'CONNECTED',
    shopName: shop.name,
    listingCount: shop.activeListingCount,
    grantedScopes: shop.grantedScopes,
    connectedAt: '2026-06-02T09:14:00.000Z',
    lastSyncedAt: shop.lastSyncedAt ?? DEMO_LAST_SYNCED,
    sync: null,
    notice: isDemoMode()
      ? 'This is the demo shop. No Etsy account is connected and nothing here can be published.'
      : null,
  }
}

/**
 * The staged sync from artboard 12, mid-flight and rate-limited.
 *
 * `total` is the shop's own listing count rather than a literal. It read
 * "412 of 412" for a catalogue of 404, on a screen whose entire job is to
 * report progress accurately.
 */
export function demoSyncState(shopName: string, listingCount: number): SyncState {
  // Roughly half way through the second stage, expressed as a fraction of the
  // real total so the two stages cannot describe different catalogues.
  const inventoryDone = Math.round(listingCount * 0.52)
  const stages: SyncStage[] = [
    { key: 'shop', label: 'Confirming shop', status: 'DONE', detail: `${shopName} · 4 s`, progress: { done: 1, total: 1 } },
    { key: 'listings', label: 'Importing listings', status: 'DONE', detail: `${listingCount} of ${listingCount}`, progress: { done: listingCount, total: listingCount } },
    { key: 'inventory', label: 'Syncing inventory and variations', status: 'RUNNING', detail: `${inventoryDone} of ${listingCount}`, progress: { done: inventoryDone, total: listingCount } },
    { key: 'orders', label: 'Loading 24 months of orders', status: 'PAUSED', detail: null, progress: null },
    { key: 'profit', label: 'Calculating profit and catalog health', status: 'QUEUED', detail: null, progress: null },
  ]

  return {
    shopName,
    stages,
    overallPercent: overallPercent(stages),
    pausedNotice:
      'Etsy temporarily limited requests. Order history continues automatically at 2:40 PM UTC — nothing is lost, and you can keep working.',
    estimateNote: `This usually takes 3–6 minutes for ${listingCount} listings. You can start using EtsyPilot now — the rest keeps syncing in the background.`,
  }
}

/* ------------------------------------------------------------- onboarding */

export const ONBOARDING_STEPS = [
  { key: 'role', label: 'Your role' },
  { key: 'goal', label: 'Primary goal' },
  { key: 'connect', label: 'Connect shop' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'value', label: 'First value' },
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key']

export const ROLES = [
  { key: 'handmade', label: 'Handmade seller', detail: 'I make and list my own products.' },
  { key: 'pod', label: 'Print-on-demand', detail: 'A supplier prints and ships for me.' },
  { key: 'digital', label: 'Digital products', detail: 'Downloads, templates, printables.' },
  { key: 'agency', label: 'Consultant or agency', detail: 'I manage shops for clients.' },
] as const

export const GOALS = [
  { key: 'research', label: 'Research keywords', detail: 'Find demand and terms to target.', href: '/research/keywords' },
  { key: 'listings', label: 'Improve my listings', detail: 'Audit titles, tags and photos.', href: '/listings/audit' },
  { key: 'profit', label: 'Understand profit', detail: 'Fees, COGS and net margin.', href: '/profit' },
  { key: 'catalog', label: 'Manage a catalog', detail: 'Bulk edits, history, rollback.', href: '/listings/bulk-editor' },
] as const

export interface ChecklistItem {
  key: string
  label: string
  detail: string | null
  done: boolean
  /** Where the item is completed. Every incomplete item has one. */
  href: string
  cta: string
  completedNote?: string
}

/**
 * The setup checklist.
 *
 * Two properties the design is explicit about, and both are enforced here:
 * it disappears when complete, and every incomplete item states what it buys.
 * "Add a default product cost" says net profit stays incomplete until costs
 * cover your sales — the reason, not the chore.
 */
export function setupChecklist(args: {
  hasCosts: boolean
  hasAudit: boolean
  hasSearch: boolean
  listingCount: number
}): ChecklistItem[] {
  return [
    {
      key: 'connect',
      label: 'Connect your Etsy shop',
      detail: null,
      done: true,
      href: '/settings/shops',
      cta: 'Review connection',
      completedNote: 'Done 12 minutes ago',
    },
    {
      key: 'goal',
      label: 'Choose your goal',
      detail: null,
      done: true,
      href: '/onboarding?step=goal',
      cta: 'Change goal',
    },
    {
      key: 'costs',
      label: 'Add a default product cost',
      detail: 'Until costs cover your sales, part of net profit rests on a default rule rather than a confirmed cost.',
      done: args.hasCosts,
      href: '/settings/costs',
      cta: 'Set up COGS',
    },
    {
      key: 'audit',
      label: 'Run your first listing audit',
      detail: `${args.listingCount} listings ready to check.`,
      done: args.hasAudit,
      href: '/listings/audit',
      cta: 'Run audit',
    },
    {
      key: 'search',
      label: 'Search your first keyword',
      detail: 'See demand, competition and related terms.',
      done: args.hasSearch,
      href: '/research/keywords',
      cta: 'Search',
    },
  ]
}

export function checklistComplete(items: ChecklistItem[]): boolean {
  return items.every((i) => i.done)
}

export { ETSY_SCOPES, selectedScopeStrings }
