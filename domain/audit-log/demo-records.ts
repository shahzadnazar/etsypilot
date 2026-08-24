/*
 * The demo shop's audit records (artboard 109's eight rows).
 *
 * Two of the eight are refusals, and that ratio is the point of the screen
 * rather than an accident of the sample: the fingerprint mismatch and the
 * demo-mode write are the records a dispute is actually about.
 *
 * Explicitly demo data. Phase 11's repository replaces this file, and nothing
 * outside domain/audit-log/store.ts imports it.
 */

import type { AuditActor, AuditRecord } from './types'

const OWNER: AuditActor = {
  name: 'Salman',
  role: 'Owner',
  // Masked. Enough to tell two sessions apart, never enough to be one.
  session: '2a··f1',
  device: 'Chrome, macOS',
}

const SYSTEM: AuditActor = {
  name: 'System',
  role: 'EtsyPilot',
  session: '—',
  device: 'Scheduled sync',
}

export function demoAuditRecords(): AuditRecord[] {
  return [
    {
      id: 'BE-2291',
      at: '2026-08-12T14:02:00.000Z',
      actor: OWNER,
      action: 'Bulk edit applied',
      detail: 'BE-2291 · tags replaced',
      target: '12 listings',
      source: 'BULK_JOB',
      reached: { kind: 'SENT', succeeded: 12, attempted: 12 },
      sequence: [
        { at: '2026-08-12T13:51:00.000Z', label: 'Validated', detail: '12 ready, 0 warnings, 0 blocked' },
        { at: '2026-08-12T13:58:00.000Z', label: 'Diff confirmed', detail: 'Fingerprint 8e04…c2f recorded' },
        { at: '2026-08-12T14:02:00.000Z', label: 'Applied', detail: '12 of 12 accepted by Etsy' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Created 13:44 by Salman',
      jobHref: '/listings/bulk-editor',
    },
    {
      id: 'BE-2291',
      at: '2026-08-12T13:58:00.000Z',
      actor: OWNER,
      action: 'Diff confirmed',
      detail: 'BE-2291 · fingerprint 8e04…c2f',
      target: '12 listings',
      source: 'MANUAL',
      /*
       * Not a refusal. Confirming a diff is an authorisation step — it was
       * never going to send anything, so "nothing sent" would be the wrong
       * shape of answer.
       */
      reached: { kind: 'NOT_APPLICABLE', reason: 'AUTHORISATION' },
      sequence: [
        { at: '2026-08-12T13:58:00.000Z', label: 'Diff confirmed', detail: 'Fingerprint 8e04…c2f recorded against the reviewed change set' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Created 13:44 by Salman',
      jobHref: '/listings/bulk-editor',
    },
    {
      id: 'BE-2288',
      at: '2026-08-11T09:14:00.000Z',
      actor: OWNER,
      action: 'Apply refused',
      detail: 'BE-2288 · catalogue changed since review',
      target: '4 listings',
      source: 'BULK_JOB',
      reached: { kind: 'NOTHING_SENT' },
      explanation:
        'The confirmed diff was fingerprinted at 09:02. Two of the four listings changed on Etsy before apply ran at 09:14, so the fingerprint no longer matched the catalogue and the operation was rejected at the gate.',
      sequence: [
        { at: '2026-08-11T09:00:00.000Z', label: 'Validated', detail: '4 ready, 0 warnings, 0 blocked' },
        { at: '2026-08-11T09:02:00.000Z', label: 'Diff confirmed', detail: 'Fingerprint 4a71…9de recorded' },
        {
          at: '2026-08-11T09:14:00.000Z',
          label: 'Refused at the gate',
          detail: 'Catalogue moved. No request reached Etsy.',
          terminal: true,
        },
      ],
      wouldHaveChanged: [
        { target: 'Linen runner 60"', field: 'price', before: '$34.00', after: '$36.00' },
        { target: 'Linen runner 72"', field: 'price', before: '$39.00', after: '$41.00' },
      ],
      wouldHaveChangedMore: 2,
      origin: 'Created 08:54 by Salman',
      jobHref: '/listings/bulk-editor',
    },
    {
      id: 'OP-9102',
      at: '2026-08-10T16:41:00.000Z',
      actor: OWNER,
      action: 'Cost rule changed',
      detail: 'OP-9102 · COGS 36% → 38%',
      target: 'Shop-wide',
      source: 'MANUAL',
      reached: { kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' },
      sequence: [
        { at: '2026-08-10T16:41:00.000Z', label: 'Cost rule changed', detail: 'Default cost rule 36% → 38% of price' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Changed on Costs & fees',
      jobHref: '/settings/costs',
    },
    {
      id: 'OP-9088',
      at: '2026-08-09T11:20:00.000Z',
      actor: OWNER,
      action: 'AI draft accepted, then published',
      detail: 'OP-9088 · title and 4 tags',
      target: 'Linen table runner',
      source: 'AI_ASSISTED',
      reached: { kind: 'SENT', succeeded: 1, attempted: 1 },
      sequence: [
        { at: '2026-08-09T11:12:00.000Z', label: 'Draft generated', detail: 'Suggested by the AI copilot, published by nobody yet' },
        { at: '2026-08-09T11:19:00.000Z', label: 'Accepted by Salman', detail: 'Edited before accepting' },
        { at: '2026-08-09T11:20:00.000Z', label: 'Applied', detail: '1 of 1 accepted by Etsy' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Created 11:12 in AI Copilot',
      jobHref: '/listings/ai-copilot',
    },
    {
      id: 'SY-4410',
      at: '2026-08-08T07:00:00.000Z',
      actor: SYSTEM,
      action: 'Sync completed',
      detail: 'SY-4410 · read only, nothing changed',
      // The whole catalogue, drafts included — a sync reads everything. Not
      // the active-listing count, which is a different question and a number
      // this record would then be able to contradict.
      target: '450 listings',
      source: 'SYNC',
      reached: { kind: 'NOT_APPLICABLE', reason: 'READ_ONLY' },
      sequence: [
        { at: '2026-08-08T06:52:00.000Z', label: 'Sync started', detail: 'Scheduled' },
        { at: '2026-08-08T07:00:00.000Z', label: 'Sync completed', detail: '450 listings read. No write was attempted.' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Scheduled sync',
      jobHref: '/settings/shops?sync=1',
    },
    {
      id: 'No operation created',
      at: '2026-08-06T10:05:00.000Z',
      actor: OWNER,
      action: 'Write refused — demo mode',
      detail: 'No operation created',
      target: '3 listings',
      source: 'MANUAL',
      reached: { kind: 'NOTHING_SENT' },
      explanation:
        'The shop was in demo mode, which cannot write to Etsy at all. The request was refused before an operation was created, so there is nothing to re-run and nothing to roll back.',
      sequence: [
        {
          at: '2026-08-06T10:05:00.000Z',
          label: 'Refused before the operation existed',
          detail: 'Demo mode is read-only. No request reached Etsy.',
          terminal: true,
        },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Attempted in the bulk editor',
      jobHref: '/settings/shops',
    },
    {
      id: 'BE-2288-R',
      at: '2026-08-02T16:41:00.000Z',
      actor: OWNER,
      action: 'Rollback applied',
      detail: 'BE-2288-R · reverted BE-2288',
      target: '9 listings',
      source: 'BULK_JOB',
      /*
       * Eight of nine. The row renders "Partly", and it renders it because the
       * numbers differ, not because anyone typed the word.
       */
      reached: { kind: 'SENT', succeeded: 8, attempted: 9 },
      explanation:
        'One listing had been edited on Etsy after the original change, so reverting it would have overwritten work EtsyPilot did not make. That listing was left alone and the other eight were reverted.',
      sequence: [
        { at: '2026-08-02T16:38:00.000Z', label: 'Rollback requested', detail: 'Reverting BE-2288' },
        { at: '2026-08-02T16:41:00.000Z', label: 'Applied', detail: '8 of 9 reverted, 1 skipped' },
      ],
      wouldHaveChanged: [],
      wouldHaveChangedMore: 0,
      origin: 'Created 16:38 by Salman',
      jobHref: '/listings/bulk-editor',
    },
  ]
}
