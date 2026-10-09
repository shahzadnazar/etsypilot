/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT CAN ACTUALLY BE EXPORTED — ONE LIST, READ BY THE ROUTE, THE COPY
 *   AND THE PRIVACY POLICY'S GUARD.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Three places made a claim about export and two of them were wrong:
 *
 *   - The export route knows the truth, because a dataset name it does not
 *     recognise is a 404.
 *   - The Privacy Policy said "export your data yourself from Settings", which
 *     reads as everything.
 *   - The landing page said "your synced shop, your cost setup, your audit
 *     history and your bulk-edit records" — two of four nouns name datasets
 *     that have no exporter.
 *
 * Prose cannot be type-checked, so the fix is to stop writing the prose twice.
 * The nouns below are the ones the marketing copy renders and the ones the
 * route serves. Adding an exporter means adding a row here, and the sentence
 * on the landing page changes with it. Removing one does the same in reverse.
 *
 * `NOT_EXPORTABLE` is here for the same reason: a seller reading "export what
 * the figures are built on" is owed the other half of the sentence, and the
 * list of absences is as load-bearing as the list of datasets. It is checked
 * by tests/unit/legal-claims.test.ts against the schema, so a table that grows
 * an exporter cannot stay on the list of things you cannot export.
 */

export interface ExportableDataset {
  /** The path segment: /api/export/<id>. */
  id: string
  /** How the dataset is named to a seller, in the middle of a sentence. */
  noun: string
}

export const EXPORTABLE_DATASETS = [
  { id: 'transactions', noun: 'your transaction ledger' },
  { id: 'audit', noun: 'your listing audit' },
  { id: 'audit-log', noun: 'your action history, including the writes that were refused' },
] as const satisfies readonly ExportableDataset[]

/*
 * `as const satisfies` and not an annotation: the annotation widens `id` to
 * `string`, and the route's narrowing — `dataset === 'transactions'` — is only
 * exhaustive against the literal union. A dataset added below is a type error
 * at the route until it is handled there.
 */
export type ExportDatasetId = (typeof EXPORTABLE_DATASETS)[number]['id']

export const EXPORT_DATASET_IDS: readonly ExportDatasetId[] = EXPORTABLE_DATASETS.map((d) => d.id)

export function isExportableDataset(value: string): value is ExportDatasetId {
  return (EXPORT_DATASET_IDS as readonly string[]).includes(value)
}

/**
 * Real data a seller might reasonably expect in an export and will not find.
 *
 * Named, not summarised. "Some things are not exportable yet" is the sentence
 * that lets a seller discover the gap at the moment they need the file.
 */
export const NOT_EXPORTABLE: readonly string[] = [
  'your listings',
  'your cost rules',
  'your bulk-edit jobs',
] as const

/** "your transaction ledger, your listing audit and your action history …" */
export function exportableNouns(): string {
  const nouns = EXPORTABLE_DATASETS.map((d) => d.noun)
  if (nouns.length <= 1) return nouns[0] ?? 'nothing yet'
  return `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]!}`
}

/** "your listings, your cost rules and your bulk-edit jobs" */
export function notExportableNouns(): string {
  const nouns = [...NOT_EXPORTABLE]
  if (nouns.length <= 1) return nouns[0] ?? 'nothing'
  return `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]!}`
}
