/**
 * Moving a versioned save file forward. Every save has a numeric `version`; when a new app changes
 * a file's shape it bumps the version and registers a step from the old one. Reading:
 *
 * - `ok`: the file is at the current version (passed through untouched) or was stepped up to it.
 * - `newer`: a NEWER app wrote it. It must never be overwritten: the caller leaves the file as it
 *   is and runs on defaults in memory for this key (see `StorageAdapter.keep`).
 * - `invalid`: not a versioned save, or a version with no way forward. The caller copies it aside
 *   before using defaults.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/** Steps by the version they start from: `{ 1: v1 → v2, 2: v2 → v3 }`. */
export type Migrations = Readonly<Record<number, Migration>>

export type MigrateResult =
  | { readonly kind: 'ok'; readonly data: unknown }
  | { readonly kind: 'newer'; readonly version: number }
  | { readonly kind: 'invalid' }

export interface MigrateOptions {
  /** The version a file without a `version` field has (settings from before it was written). */
  readonly missingVersion?: number
}

export function migrateSave(
  raw: unknown,
  current: number,
  steps: Migrations,
  options: MigrateOptions = {},
): MigrateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'invalid' }
  const record = raw as Record<string, unknown>
  const version = record.version === undefined ? options.missingVersion : record.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { kind: 'invalid' }
  if (version > current) return { kind: 'newer', version }
  if (version === current) return { kind: 'ok', data: raw }
  let data = record
  for (let from = version; from < current; from++) {
    const step = steps[from]
    if (!step) return { kind: 'invalid' }
    try {
      data = { ...step(data), version: from + 1 }
    } catch {
      return { kind: 'invalid' }
    }
  }
  return { kind: 'ok', data }
}
