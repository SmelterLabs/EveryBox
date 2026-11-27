import type { AppUpdateStatus } from '../shared/types'

const RELEASES_LATEST_URL = 'https://api.github.com/repos/SmelterLabs/EveryBox/releases/latest'
const REQUEST_TIMEOUT_MS = 6_000

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

interface GitHubLatestReleaseResponse {
  tag_name?: string
  html_url?: string
  name?: string
  published_at?: string
}

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '')
}

function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = normalizeVersion(raw).split('+')[0]
  if (!cleaned) return null
  const dashIdx = cleaned.indexOf('-')
  const corePart = dashIdx === -1 ? cleaned : cleaned.slice(0, dashIdx)
  const prePart = dashIdx === -1 ? '' : cleaned.slice(dashIdx + 1)

  const segments = corePart.split('.')
  if (segments.length < 1 || segments.length > 3) return null
  const nums = segments.map((s) => (/^\d+$/.test(s) ? Number(s) : NaN))
  if (nums.some((n) => !Number.isFinite(n))) return null

  return {
    major: nums[0] ?? 0,
    minor: nums[1] ?? 0,
    patch: nums[2] ?? 0,
    prerelease: prePart ? prePart.split('.').filter(Boolean) : []
  }
}

/**
 * Returns > 0 if `a` is newer than `b`, < 0 if `a` is older, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return 0

  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  if (pa.patch !== pb.patch) return pa.patch - pb.patch

  const aHasPre = pa.prerelease.length > 0
  const bHasPre = pb.prerelease.length > 0
  if (!aHasPre && !bHasPre) return 0
  if (!aHasPre && bHasPre) return 1
  if (aHasPre && !bHasPre) return -1

  const len = Math.max(pa.prerelease.length, pb.prerelease.length)
  for (let i = 0; i < len; i++) {
    const idA = pa.prerelease[i]
    const idB = pb.prerelease[i]
    if (idA === undefined) return -1
    if (idB === undefined) return 1
    if (idA === idB) continue

    const aNum = /^\d+$/.test(idA)
    const bNum = /^\d+$/.test(idB)
    if (aNum && bNum) return Number(idA) - Number(idB)
    if (aNum && !bNum) return -1
    if (!aNum && bNum) return 1
    return idA.localeCompare(idB)
  }

  return 0
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0
}

export async function checkForAppUpdates(currentVersion: string): Promise<AppUpdateStatus> {
  const normalizedCurrent = normalizeVersion(currentVersion)
  const checkedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `EveryBox/${normalizedCurrent || '0.0.0'}`
      },
      signal: controller.signal
    })

    if (res.status === 404) {
      return {
        currentVersion: normalizedCurrent,
        updateAvailable: false,
        checkedAt
      }
    }

    if (!res.ok) {
      return {
        currentVersion: normalizedCurrent,
        updateAvailable: false,
        checkedAt,
        error: `Update check failed (HTTP ${res.status})`
      }
    }

    const data = (await res.json()) as GitHubLatestReleaseResponse
    const latestVersion = data.tag_name ? normalizeVersion(data.tag_name) : undefined
    const updateAvailable = latestVersion ? isNewerVersion(latestVersion, normalizedCurrent) : false
    const releaseUrl =
      typeof data.html_url === 'string' && data.html_url.startsWith('https://') ? data.html_url : undefined

    return {
      currentVersion: normalizedCurrent,
      latestVersion,
      updateAvailable,
      releaseUrl,
      releaseName: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined,
      publishedAt: typeof data.published_at === 'string' ? data.published_at : undefined,
      checkedAt
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      currentVersion: normalizedCurrent,
      updateAvailable: false,
      checkedAt,
      error: isAbort ? 'Update check timed out' : err instanceof Error ? err.message : String(err)
    }
  } finally {
    clearTimeout(timer)
  }
}
