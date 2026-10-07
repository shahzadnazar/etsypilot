import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE TWO IMMUTABLE TRAILS. BOTH WERE Maps, AND BOTH PAGES PROMISE THE
 *   OPPOSITE IN SO MANY WORDS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * /settings/audit-log: "Records are immutable and cannot be edited or deleted
 * from this page." /listings/change-history: the trail a rollback is issued
 * from. Both were `Map`s on a global Symbol that die with the process, and on
 * a host running more than one instance a record appended by a POST is
 * invisible to the page that renders it.
 *
 * Measured in a browser on a live account before this file existed:
 *
 *   /settings/audit-log        eight records by "Salman", including "AI draft
 *                              accepted, then published · Linen table runner ·
 *                              Reached Etsy: Yes · 1 of 1" — an immutable log
 *                              asserting writes to a shop that has never
 *                              connected to Etsy.
 *   /listings/change-history   HTTP 500.
 *
 * ── APPEND-ONLY, BY HAVING NO OTHER VERB ──────────────────────────────────
 *
 * There is no update and no delete here, for the same reason the old stores
 * had none: the page makes a promise about the record, and a repository with a
 * `remove` on it would make that a promise about discipline. A rollback writes
 * a NEW job; it does not edit the one it reverses.
 *
 * ── SHOP SCOPING IS STRUCTURAL ────────────────────────────────────────────
 *
 * Every exported function takes `shopId` first and every statement filters on
 * it. tests/unit/change-jobs-repository.test.ts runs the shared sweep.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import type { ChangeItem, ChangeJob, ChangeSource } from '@/domain/change-history/types'
import type { AuditRecord } from '@/domain/audit-log/types'

/* ----------------------------------------------------------- change jobs */

/** Newest first. The trail the change-history page renders. */
export async function readChangeJobs(shopId: string, limit = 200): Promise<ChangeJob[]> {
  const rows = await getDb()
    .select()
    .from(schema.changeJobs)
    .where(eq(schema.changeJobs.shopId, shopId))
    .orderBy(desc(schema.changeJobs.at), desc(schema.changeJobs.id))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actor: row.actorName,
    source: row.source as ChangeSource,
    summary: row.summary,
    items: (row.items ?? []) as ChangeItem[],
    ...(row.linkedExperiment
      ? { linkedExperiment: row.linkedExperiment as ChangeJob['linkedExperiment'] }
      : {}),
  }))
}

/** One job by id, scoped to the shop. Null when this shop has no such job. */
export async function readChangeJob(shopId: string, jobId: string): Promise<ChangeJob | null> {
  const rows = await getDb()
    .select()
    .from(schema.changeJobs)
    .where(and(eq(schema.changeJobs.shopId, shopId), eq(schema.changeJobs.id, jobId)))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    at: row.at.toISOString(),
    actor: row.actorName,
    source: row.source as ChangeSource,
    summary: row.summary,
    items: (row.items ?? []) as ChangeItem[],
    ...(row.linkedExperiment
      ? { linkedExperiment: row.linkedExperiment as ChangeJob['linkedExperiment'] }
      : {}),
  }
}

/**
 * Record a job. One INSERT, no upsert.
 *
 * `onConflictDoNothing` rather than a merge: a job id that already exists is a
 * retry, and a retry must not be able to rewrite what the first attempt
 * recorded — which is the whole claim the page makes about this trail.
 */
export async function writeChangeJob(
  shopId: string,
  actorId: string | null,
  job: ChangeJob,
): Promise<void> {
  await getDb()
    .insert(schema.changeJobs)
    .values({
      id: job.id,
      shopId,
      actorId,
      actorName: job.actor,
      at: new Date(job.at),
      source: job.source,
      summary: job.summary,
      items: job.items as unknown[],
      linkedExperiment: job.linkedExperiment ?? null,
    })
    .onConflictDoNothing()
}

export async function countChangeJobs(shopId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.changeJobs)
    .where(eq(schema.changeJobs.shopId, shopId))
  return row?.total ?? 0
}

/* --------------------------------------------------------- audit records */

/** Newest first, with the sequence breaking ties. */
export async function readAuditRecords(shopId: string, limit = 500): Promise<AuditRecord[]> {
  const rows = await getDb()
    .select({ seq: schema.auditRecords.seq, record: schema.auditRecords.record })
    .from(schema.auditRecords)
    .where(eq(schema.auditRecords.shopId, shopId))
    .orderBy(desc(schema.auditRecords.at), desc(schema.auditRecords.seq))
    .limit(limit)

  return rows.map((row) => ({ ...(row.record as AuditRecord), seq: row.seq }))
}

/**
 * Append one record, assigning its sequence.
 *
 * ── THE SEQUENCE IS THE STORE'S TO GIVE ───────────────────────────────────
 *
 * `max(seq) + 1` within the shop. A caller that could choose a sequence could
 * choose a duplicate, and the sequence is part of a record's address — two
 * refusals a millisecond apart share an operation id and a timestamp, which is
 * the collision that made the log's drawer unable to open the second of them.
 *
 * ── WHY READ-THEN-INSERT AND NOT ONE STATEMENT ────────────────────────────
 *
 * The obvious version is `insert ... select coalesce(max(seq), -1) + 1 ...`,
 * one atomic statement. It was written that way first and replaced, because it
 * buries `where shop_id = ...` inside a raw SQL template where the static
 * sweep cannot see it — the same shape the cost repository's `DISTINCT ON`
 * draft was rejected for. A read and an insert that are each visibly scoped
 * are worth more than atomicity bought with an invisible predicate.
 *
 * The race is real and it is handled rather than ignored: the composite
 * primary key rejects a duplicate sequence, so two concurrent appends collide
 * loudly and the loser retries with a fresh maximum. Losing twice in a row
 * would need three simultaneous writers on one shop, and the third attempt
 * throws rather than silently writing to the wrong address.
 */
export async function appendAuditRecord(
  shopId: string,
  actorId: string | null,
  record: AuditRecord,
): Promise<number> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const [highest] = await getDb()
      .select({ seq: schema.auditRecords.seq })
      .from(schema.auditRecords)
      .where(eq(schema.auditRecords.shopId, shopId))
      .orderBy(desc(schema.auditRecords.seq))
      .limit(1)

    const seq = (highest?.seq ?? -1) + 1
    try {
      await getDb()
        .insert(schema.auditRecords)
        .values({
          shopId,
          seq,
          operationId: record.id,
          at: new Date(record.at),
          actorId,
          source: record.source,
          reachedKind: record.reached.kind,
          record: { ...record, seq },
        })
      return seq
    } catch (error) {
      // A duplicate sequence means somebody else appended between the two
      // statements. Re-read and try again; anything else is not ours to catch.
      lastError = error
    }
  }
  throw lastError
}

export async function countAuditRecords(shopId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.auditRecords)
    .where(eq(schema.auditRecords.shopId, shopId))
  return row?.total ?? 0
}
