/*
 * A minimal ZIP writer.
 *
 * This exists because the download route used to shell out to `zip`, which is
 * an assumption rather than a dependency: it is absent on Windows, absent from
 * slim container images, and absent from every serverless runtime this could
 * deploy to. When it is missing, `execFileSync` throws ENOENT and the seller
 * gets a 500 that says nothing about the real cause.
 *
 * Stored entries only — no compression. An extension package is a few
 * kilobytes of text, so DEFLATE would buy nothing and would mean carrying a
 * compressor. Every ZIP reader supports method 0.
 *
 * The output is DETERMINISTIC: the timestamp is fixed rather than read from the
 * clock, so the same files always produce the same bytes. That makes the
 * package hashable, and it means a test can assert on the archive itself rather
 * than on a description of it.
 */

/** 1980-01-01 00:00:00 — the earliest a DOS timestamp can express. */
const DOS_TIME = 0
const DOS_DATE = 33 // (1980-1980)<<9 | 1<<5 | 1

export interface ZipEntry {
  /** Forward-slash relative path, as the ZIP spec requires. */
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xff_ff_ff_ff
  for (let i = 0; i < data.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xff_ff_ff_ff) >>> 0
}

/**
 * Build a ZIP archive from entries.
 *
 * Entries are sorted by name so archive bytes do not depend on the order the
 * filesystem happened to hand them over.
 */
export function zipSync(entries: ZipEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of sorted) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04_03_4b_50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, 0, true) // method: stored
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true) // compressed
    lv.setUint32(22, size, true) // uncompressed
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02_01_4b_50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk number
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0o1_00_644 << 16, true) // external attrs: regular file, 0644
    cv.setUint32(42, offset, true) // local header offset
    central.set(name, 46)

    locals.push(local, entry.data)
    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06_05_4b_50, true) // end of central directory
  ev.setUint16(4, 0, true) // disk
  ev.setUint16(6, 0, true) // disk with central dir
  ev.setUint16(8, sorted.length, true)
  ev.setUint16(10, sorted.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true) // comment length

  const total =
    locals.reduce((n, p) => n + p.length, 0) + centralSize + end.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
