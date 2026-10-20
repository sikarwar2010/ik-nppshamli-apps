/**
 * Content sniffing from magic bytes. Client-supplied MIME types and file
 * extensions are never trusted for stored survey images.
 */

export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf"

export const IMAGE_TYPES: ReadonlySet<SniffedType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export const EXTENSION_BY_TYPE: Record<SniffedType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false
  return bytes.every((b, i) => buf[offset + i] === b)
}

export function sniffFileType(buf: Buffer): SniffedType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp"
  }
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"
  return null
}

/**
 * Structural integrity check beyond the header: a JPEG must end with the EOI
 * marker (truncated downloads fail this), a PNG must end with an IEND chunk.
 */
export function looksComplete(buf: Buffer, type: SniffedType): boolean {
  if (type === "image/jpeg") {
    // Some encoders pad after EOI; search the tail rather than the last 2 bytes.
    const tail = buf.subarray(Math.max(0, buf.length - 64))
    for (let i = tail.length - 2; i >= 0; i--) {
      if (tail[i] === 0xff && tail[i + 1] === 0xd9) return true
    }
    return false
  }
  if (type === "image/png") {
    return buf.subarray(Math.max(0, buf.length - 12)).includes(
      Buffer.from("IEND")
    )
  }
  return buf.length > 0
}
