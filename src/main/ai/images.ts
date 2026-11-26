import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import type { Message } from '../../shared/types'

export interface AIImageInput {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  base64: string
}

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MIN_BASE64_LEN = 2000 // ~1.5 KB — skips 1x1 tracking pixels & tiny spacer icons
const MAX_BASE64_LEN = 4_500_000 // ~3.3 MB binary cap per image

function normalizeMime(raw: string): AIImageInput['mimeType'] | null {
  const m = raw.toLowerCase().trim()
  if (m === 'image/jpg') return 'image/jpeg'
  if (ALLOWED_MIMES.has(m)) return m as AIImageInput['mimeType']
  return null
}

/**
 * Extracts inline data-URI images and local image attachments from the most recent
 * messages in a thread so multimodal AI providers can actually see charts, receipts,
 * and screenshots embedded in emails.
 */
export async function extractEmailImages(messages: Message[], maxImages = 3): Promise<AIImageInput[]> {
  const results: AIImageInput[] = []
  const seen = new Set<string>()

  // Scan latest messages first
  const recent = [...messages].slice(-3).reverse()

  for (const m of recent) {
    if (results.length >= maxImages) break

    // 1. Inline data:image/...;base64,... URIs embedded in bodyHtml (CID inline images)
    if (m.bodyHtml) {
      const dataUriRe = /data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)/gi
      let match: RegExpExecArray | null
      while ((match = dataUriRe.exec(m.bodyHtml)) !== null && results.length < maxImages) {
        const mimeType = normalizeMime(match[1])
        const base64 = match[2].replace(/\s+/g, '')
        if (!mimeType || base64.length < MIN_BASE64_LEN || base64.length > MAX_BASE64_LEN) continue
        const fingerprint = base64.slice(0, 96)
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)
        results.push({ mimeType, base64 })
      }
    }

    // 2. Local image attachments on disk
    for (const att of m.attachments || []) {
      if (results.length >= maxImages) break
      const mimeType = normalizeMime(att.mimeType || '')
      if (!mimeType || !att.localPath || !existsSync(att.localPath)) continue
      try {
        const buf = await readFile(att.localPath)
        const base64 = buf.toString('base64')
        if (base64.length < MIN_BASE64_LEN || base64.length > MAX_BASE64_LEN) continue
        const fingerprint = base64.slice(0, 96)
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)
        results.push({ mimeType, base64 })
      } catch {
        // Ignore unreadable attachment
      }
    }
  }

  return results
}
