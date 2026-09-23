import { describe, expect, it } from 'vitest'
import { crc32 as nodeCrc32 } from 'node:zlib'
import yauzl from 'yauzl'

import { crc32, zipSync } from '@/lib/extension/zip'

/*
 * These tests hand the output to a REAL zip reader.
 *
 * The point is to avoid the trap this whole change exists to fix. Asserting
 * that zipSync returns bytes starting `PK` would pass for an archive no
 * extension store and no seller could open — it would be checking that I wrote
 * down what I intended, not that the file works. What reads the archive here
 * did not write it, so it can disagree with me.
 *
 * ── IT USED TO SHELL OUT TO `unzip`, AND WINDOWS HAS NONE ─────────────────
 *
 * Three of these tests errored on a Windows machine for want of a binary that
 * ships with every Linux and no Windows. The intent had to survive the fix, so
 * the reader is a library rather than our own parser — but which library was
 * MEASURED rather than assumed, and the measurement changed the design.
 *
 * An archive was built, its CRC field corrupted in both the local header and
 * the central directory, and every candidate asked to read it:
 *
 *   unzip -tqq   REJECTED  "bad CRC 0d4a1185 (should be deadbeef)"
 *   fflate       accepted
 *   yauzl        accepted
 *
 * NEITHER JAVASCRIPT READER CHECKS THE CRC OF A STORED ENTRY, and this writer
 * stores every entry uncompressed. So swapping `unzip` for either of them
 * would have kept the test green while quietly dropping the one thing
 * `unzip -t` was there for.
 *
 * What replaced it is stronger than what it replaced, and is two independent
 * implementations rather than one:
 *
 *   yauzl              parses the container — the central directory, the
 *                      offsets, the names, the sizes — and hands back the CRC
 *                      the archive RECORDS for each entry.
 *   node:zlib.crc32    computes what that CRC SHOULD be, from the extracted
 *                      bytes, in C, in the platform's own zlib.
 *
 * Asserting the two agree is what `unzip -t` was doing internally, done
 * explicitly, and it fails on the corrupt archive above where both readers
 * alone are happy. The check digits, the container and the bytes are each
 * verified by something that did not write them.
 */

const text = (s: string) => new TextEncoder().encode(s)

interface ReadEntry {
  name: string
  /** The CRC the ARCHIVE claims, read out of the central directory by yauzl. */
  recordedCrc: number
  data: Buffer
}

/** Read an archive with yauzl. Rejects rather than resolving on a bad one. */
function readArchive(bytes: Uint8Array): Promise<ReadEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (openError, zip) => {
      if (openError || !zip) return reject(openError ?? new Error('no archive'))
      const out: ReadEntry[] = []
      zip.on('error', reject)
      zip.on('end', () => resolve(out))
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error('no stream'))
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('error', reject)
          stream.on('end', () => {
            out.push({
              name: entry.fileName,
              recordedCrc: entry.crc32 >>> 0,
              data: Buffer.concat(chunks),
            })
            zip.readEntry()
          })
        })
      })
      zip.readEntry()
    })
  })
}

/**
 * Round-trip through the independent reader, verifying every check digit.
 *
 * The CRC assertion lives HERE rather than in one test, so every archive any
 * test builds is check-digit verified. A helper that only extracted would let
 * the next test added quietly skip the part that matters.
 */
async function roundTrip(
  entries: { name: string; data: Uint8Array }[],
): Promise<Record<string, string>> {
  const read = await readArchive(zipSync(entries))

  const out: Record<string, string> = {}
  for (const entry of read) {
    expect(
      entry.recordedCrc,
      `${entry.name}: the archive records CRC ${entry.recordedCrc.toString(16)}, and the bytes hash to ${(nodeCrc32(entry.data) >>> 0).toString(16)}`,
    ).toBe(nodeCrc32(entry.data) >>> 0)
    out[entry.name] = entry.data.toString('utf8')
  }
  return out
}

describe('the extension archive is a real zip', () => {
  it('round-trips through an independent zip reader', async () => {
    const files = [
      { name: 'manifest.json', data: text('{"manifest_version":3}\n') },
      { name: 'popup.html', data: text('<!doctype html><title>EtsyPilot</title>') },
      { name: 'dist/extension/src/popup.js', data: text('export const x = 1\n') },
    ]
    const back = await roundTrip(files)

    expect(back['manifest.json']).toBe('{"manifest_version":3}\n')
    expect(back['popup.html']).toBe('<!doctype html><title>EtsyPilot</title>')
    expect(back['dist/extension/src/popup.js']).toBe('export const x = 1\n')
  })

  it('preserves nested paths, which is how the package is laid out', async () => {
    // A flat archive would still pass a structural check. This is what would
    // actually break a loaded extension: manifest.json found, compiled JS not.
    const back = await roundTrip([
      { name: 'a/b/c/deep.js', data: text('deep\n') },
      { name: 'top.js', data: text('top\n') },
    ])
    expect(Object.keys(back).sort()).toEqual(['a/b/c/deep.js', 'top.js'])
  })

  it('handles non-ASCII bytes without corrupting them', async () => {
    const back = await roundTrip([{ name: 'copy.txt', data: text('Profit — margin · 中文 🧵') }])
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

  it('REJECTS AN ARCHIVE WHOSE CHECK DIGITS ARE WRONG', async () => {
    /*
     * The positive control, and the reason this file did not simply swap one
     * reader for another. A round-trip test that only extracts passes on a
     * corrupt archive — both JavaScript readers did, above — so the guard has
     * to be pointed at a bad archive and made to find it.
     *
     * The corruption is deliberately the QUIETEST possible: the CRC field in
     * the local header and in the central directory, and nothing else. Every
     * length, offset, name and byte of payload stays correct, so the archive
     * is structurally perfect and only its check digits lie. That is exactly
     * the failure a "does it start with PK" test cannot see.
     */
    const good = zipSync([{ name: 'a.txt', data: text('hello world') }])
    const corrupt = Uint8Array.from(good)
    const view = new DataView(corrupt.buffer)
    view.setUint32(14, 0xdead_beef, true) // local file header
    for (let at = 0; at < corrupt.length - 4; at += 1) {
      if (view.getUint32(at, true) === 0x0201_4b50) {
        view.setUint32(at + 16, 0xdead_beef, true) // central directory
        break
      }
    }
    expect(Buffer.from(corrupt)).not.toEqual(Buffer.from(good))

    const read = await readArchive(corrupt)
    expect(read).toHaveLength(1)
    // The reader is perfectly happy: it hands back the right bytes.
    expect(read[0]!.data.toString('utf8')).toBe('hello world')
    // The check digits are what catch it.
    expect(read[0]!.recordedCrc).toBe(0xdead_beef)
    expect(nodeCrc32(read[0]!.data) >>> 0).not.toBe(read[0]!.recordedCrc)
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
