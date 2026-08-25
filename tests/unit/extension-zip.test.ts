import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, zipSync } from '@/lib/extension/zip'

/*
 * These tests hand the output to a REAL zip reader.
 *
 * The point is to avoid the trap this whole change exists to fix. Asserting
 * that zipSync returns bytes starting `PK` would pass for an archive no
 * extension store and no seller could open — it would be checking that I wrote
 * down what I intended, not that the file works. `unzip -t` is an independent
 * implementation, so it can disagree with mine.
 */

const text = (s: string) => new TextEncoder().encode(s)

function roundTrip(entries: { name: string; data: Uint8Array }[]): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'ziptest-'))
  try {
    const archive = join(dir, 'a.zip')
    writeFileSync(archive, zipSync(entries))

    // Fails loudly if the central directory, CRCs or offsets are wrong.
    execFileSync('unzip', ['-tqq', archive])
    execFileSync('unzip', ['-qq', archive, '-d', join(dir, 'out')])

    const out: Record<string, string> = {}
    for (const entry of entries) {
      out[entry.name] = readFileSync(join(dir, 'out', entry.name), 'utf8')
    }
    return out
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('the extension archive is a real zip', () => {
  it('round-trips through an independent zip reader', () => {
    const files = [
      { name: 'manifest.json', data: text('{"manifest_version":3}\n') },
      { name: 'popup.html', data: text('<!doctype html><title>EtsyPilot</title>') },
      { name: 'dist/extension/src/popup.js', data: text('export const x = 1\n') },
    ]
    const back = roundTrip(files)

    expect(back['manifest.json']).toBe('{"manifest_version":3}\n')
    expect(back['popup.html']).toBe('<!doctype html><title>EtsyPilot</title>')
    expect(back['dist/extension/src/popup.js']).toBe('export const x = 1\n')
  })

  it('preserves nested paths, which is how the package is laid out', () => {
    // A flat archive would still pass `unzip -t`. This is what would actually
    // break a loaded extension: manifest.json found, compiled JS not.
    const back = roundTrip([
      { name: 'a/b/c/deep.js', data: text('deep\n') },
      { name: 'top.js', data: text('top\n') },
    ])
    expect(Object.keys(back).sort()).toEqual(['a/b/c/deep.js', 'top.js'])
  })

  it('handles non-ASCII bytes without corrupting them', () => {
    const back = roundTrip([{ name: 'copy.txt', data: text('Profit — margin · 中文 🧵') }])
    expect(back['copy.txt']).toBe('Profit — margin · 中文 🧵')
  })

  it('is deterministic: the same files give byte-identical archives', () => {
    // No clock in the output. A timestamp would make the package unhashable,
    // and the build already reports a sha256 per browser.
    const files = [{ name: 'x.txt', data: text('same') }]
    expect(Buffer.from(zipSync(files))).toEqual(Buffer.from(zipSync(files)))
  })

  it('does not depend on the order the filesystem listed the files', () => {
    const a = [
      { name: 'b.txt', data: text('b') },
      { name: 'a.txt', data: text('a') },
    ]
    const b = [
      { name: 'a.txt', data: text('a') },
      { name: 'b.txt', data: text('b') },
    ]
    expect(Buffer.from(zipSync(a))).toEqual(Buffer.from(zipSync(b)))
  })

  it('computes CRC32 against known values', () => {
    // The check digits a reader uses to reject a corrupt entry. Wrong CRCs
    // still produce a well-formed archive that fails on extraction.
    expect(crc32(text(''))).toBe(0)
    expect(crc32(text('a'))).toBe(0xe8_b7_be_43)
    expect(crc32(text('123456789'))).toBe(0xcb_f4_39_26)
  })

  it('writes an empty archive rather than throwing on no entries', () => {
    const empty = zipSync([])
    expect(empty.length).toBe(22) // end-of-central-directory record only
  })
})
