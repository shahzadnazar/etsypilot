/*
 * LiveEtsyService - Phase 11.
 *
 * Deliberately unimplemented. It exists now so the seam is visible and the
 * selector in index.ts has something real to point at; every method throws a
 * named error rather than a bare `throw new Error`, so if the mode is ever
 * misconfigured the failure is legible.
 *
 * When credentials arrive, this file is the only one that needs writing.
 */

import { AppError } from '@/lib/errors/types'
import type { Provenanced } from '@/lib/provenance/types'
import type {
  EtsyListing,
  EtsyOrder,
  EtsyService,
  EtsyShop,
  ListingWriteRequest,
  ListingWriteResult,
  SyncProgress,
} from './interface'

function notImplemented(method: string): AppError {
  return new AppError({
    kind: 'EXTERNAL_SERVICE',
    code: 'LIVE_ETSY_NOT_IMPLEMENTED',
    message: 'Live Etsy access is not available yet.',
    recovery: 'EtsyPilot is running in demo mode. Switch ETSY_MODE back to "mock".',
    context: { method },
  })
}

export class LiveEtsyService implements EtsyService {
  readonly canWrite = true
  readonly mode = 'live' as const

  async getShop(_shopId: string): Promise<EtsyShop> {
    throw notImplemented('getShop')
  }
  async getListings(_shopId: string): Promise<{ listings: EtsyListing[]; total: number }> {
    throw notImplemented('getListings')
  }
  async getListing(_shopId: string, _id: string): Promise<EtsyListing | null> {
    throw notImplemented('getListing')
  }
  async getOrders(_shopId: string): Promise<EtsyOrder[]> {
    throw notImplemented('getOrders')
  }
  async getSyncProgress(_shopId: string): Promise<SyncProgress> {
    throw notImplemented('getSyncProgress')
  }
  async applyListingChanges(
    _shopId: string,
    _requests: ListingWriteRequest[],
  ): Promise<ListingWriteResult[]> {
    throw notImplemented('applyListingChanges')
  }
  async getListingViews(_shopId: string, _id: string): Promise<Provenanced<number>> {
    throw notImplemented('getListingViews')
  }
  async getAdsPerformance(_shopId: string): Promise<Provenanced<number>> {
    throw notImplemented('getAdsPerformance')
  }
}
