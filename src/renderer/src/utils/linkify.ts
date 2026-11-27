const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'NOSCRIPT', 'SVG'])

// Match http(s)://... or www.<domain>... (not preceded by a word char or @)
const URL_REGEX = /(?:https?:\/\/|(?<![\w@])www\.)[^\s<>"'`]+/gi
const TRAILING_PUNCT = /[.,;:!?'"`>]+$/

export function trimTrailingUrlPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw
  let trailing = ''

  while (url.length > 0) {
    const punctMatch = url.match(TRAILING_PUNCT)
    if (punctMatch) {
      trailing = punctMatch[0] + trailing
      url = url.slice(0, -punctMatch[0].length)
      continue
    }

    const last = url[url.length - 1]
    if (last === ')' || last === ']' || last === '}') {
      const open = last === ')' ? '(' : last === ']' ? '[' : '{'
      let openCount = 0
      let closeCount = 0
      for (const ch of url) {
        if (ch === open) openCount++
        else if (ch === last) closeCount++
      }
      if (closeCount > openCount) {
        trailing = last + trailing
        url = url.slice(0, -1)
        continue
      }
    }

    break
  }

  return { url, trailing }
}

export function normalizeLinkHref(rawUrl: string): string | null {
  const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname
    if (!host) return null
    if (host !== 'localhost' && !/^[^.]+\..*[^.]$/.test(host)) return null
    return candidate
  } catch {
    return null
  }
}

function hasSkippedAncestor(node: Node, root: Node): boolean {
  let current: Node | null = node.parentNode
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has((current as Element).tagName)) {
      return true
    }
    current = current.parentNode
  }
  return false
}

/**
 * Walks text nodes inside `root` and converts bare http(s):// and www. URLs
 * into clickable <a> elements, skipping text already inside <a> or non-content tags.
 */
export function linkifyElement(root: HTMLElement): void {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.nodeValue
    if (!text || (!text.includes('://') && !/www\./i.test(text))) continue
    if (hasSkippedAncestor(node, root)) continue
    textNodes.push(node as Text)
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || ''
    URL_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    let lastIndex = 0
    let fragment: DocumentFragment | null = null

    while ((match = URL_REGEX.exec(text)) !== null) {
      const { url, trailing } = trimTrailingUrlPunctuation(match[0])
      const href = normalizeLinkHref(url)
      if (!href) continue

      if (!fragment) fragment = doc.createDocumentFragment()
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)))
      }

      const anchor = doc.createElement('a')
      anchor.href = href
      anchor.textContent = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      fragment.appendChild(anchor)

      if (trailing) {
        fragment.appendChild(doc.createTextNode(trailing))
      }

      lastIndex = match.index + match[0].length
    }

    if (fragment) {
      if (lastIndex < text.length) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex)))
      }
      textNode.parentNode?.replaceChild(fragment, textNode)
    }
  }
}
