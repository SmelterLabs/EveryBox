const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  laquo: '«',
  raquo: '»',
  zwnj: '',
  zwj: '',
  shy: ''
}

const ENTITY_REGEX = /&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g

/**
 * Decode common named and numeric HTML entities in a single pass
 * (so `&amp;lt;` becomes `&lt;` rather than double-decoding to `<`).
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes('&')) return input || ''
  return input.replace(ENTITY_REGEX, (match, dec?: string, hex?: string, named?: string) => {
    if (dec) {
      const code = Number.parseInt(dec, 10)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
        return code === 160 ? ' ' : String.fromCodePoint(code)
      }
      return match
    }
    if (hex) {
      const code = Number.parseInt(hex, 16)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
        return code === 160 ? ' ' : String.fromCodePoint(code)
      }
      return match
    }
    if (named) {
      const decoded = NAMED_HTML_ENTITIES[named] ?? NAMED_HTML_ENTITIES[named.toLowerCase()]
      if (decoded !== undefined) return decoded
    }
    return match
  })
}

/**
 * Decode HTML entities and normalize whitespace for single-line email preview snippets.
 */
export function cleanSnippet(input: string): string {
  if (!input) return ''
  return decodeHtmlEntities(input).replace(/\s+/g, ' ').trim()
}

// Reverse map for Windows-1252 printable characters in 0x80–0x9F
const CP1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
}

function charToCp1252Byte(code: number): number | null {
  if (code <= 0xff) return code
  return CP1252_TO_BYTE[code] ?? null
}

/**
 * Strict, runtime-agnostic UTF-8 multi-byte sequence decoder (works identically in Node,
 * browsers, and React Native Hermes without requiring DOM `TextDecoder` `{ fatal: true }`).
 */
function decodeStrictUtf8Sequence(bytes: number[]): string | null {
  const len = bytes.length
  if (len === 2) {
    const cp = ((bytes[0] & 0x1f) << 6) | (bytes[1] & 0x3f)
    if (cp < 0x80) return null // overlong
    return String.fromCodePoint(cp)
  }
  if (len === 3) {
    const cp = ((bytes[0] & 0x0f) << 12) | ((bytes[1] & 0x3f) << 6) | (bytes[2] & 0x3f)
    if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) return null // overlong or UTF-16 surrogate
    return String.fromCodePoint(cp)
  }
  if (len === 4) {
    const cp =
      ((bytes[0] & 0x07) << 18) |
      ((bytes[1] & 0x3f) << 12) |
      ((bytes[2] & 0x3f) << 6) |
      (bytes[3] & 0x3f)
    if (cp < 0x10000 || cp > 0x10ffff) return null // overlong or out of Unicode range
    return String.fromCodePoint(cp)
  }
  return null
}

/**
 * Repair UTF-8 text that was mis-decoded as Windows-1252 / Latin-1 (e.g. `â€”` -> `—`, `âš ï¸` -> `⚠️`).
 * Only replaces valid multi-byte UTF-8 sequences; genuine ASCII and Unicode text is left untouched.
 */
export function repairMojibake(input: string): string {
  if (!input || !/[\u00C2-\u00F4]/.test(input)) return input || ''
  const bytes: (number | null)[] = []
  for (let i = 0; i < input.length; i++) {
    bytes.push(charToCp1252Byte(input.charCodeAt(i)))
  }

  let out = ''
  let i = 0
  let justRepairedNonAscii = false

  while (i < input.length) {
    const b0 = bytes[i]

    // Handle Gmail/CP1252 dropping 0x8F (undefined in CP1252) from UTF-8 U+FE0F (EF B8 8F -> `ï¸` + optional space)
    if (justRepairedNonAscii && b0 === 0xef && bytes[i + 1] === 0xb8) {
      out += '\uFE0F'
      i += 2
      if (input[i] === ' ' && input[i + 1] === ' ') {
        i += 1
      }
      justRepairedNonAscii = false
      continue
    }

    let seqLen = 0
    if (b0 !== null) {
      if (b0 >= 0xc2 && b0 <= 0xdf) seqLen = 2
      else if (b0 >= 0xe0 && b0 <= 0xef) seqLen = 3
      else if (b0 >= 0xf0 && b0 <= 0xf4) seqLen = 4
    }

    if (seqLen > 0 && i + seqLen <= input.length) {
      const slice: number[] = []
      let valid = true
      for (let k = 0; k < seqLen; k++) {
        const bk = bytes[i + k]
        if (bk === null || (k > 0 && (bk < 0x80 || bk > 0xbf))) {
          valid = false
          break
        }
        slice.push(bk)
      }
      if (valid) {
        const decoded = decodeStrictUtf8Sequence(slice)
        if (decoded !== null) {
          out += decoded
          i += seqLen
          justRepairedNonAscii = true
          continue
        }
      }
    }

    out += input[i]
    justRepairedNonAscii = false
    i += 1
  }

  return out
}
