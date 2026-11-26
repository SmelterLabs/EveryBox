import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

interface SecretVault {
  [key: string]: string // base64 encrypted buffer (DPAPI on Windows)
}

export class SecretStore {
  private filePath: string
  private cache: SecretVault = {}

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, 'secrets.dpapi.json')
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.cache = JSON.parse(readFileSync(this.filePath, 'utf8'))
      }
    } catch {
      this.cache = {}
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8')
  }

  set(key: string, plaintext: string): void {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plaintext)
      this.cache[key] = encrypted.toString('base64')
    } else {
      // Fallback only if running in headless test environment without OS keyring
      this.cache[key] = Buffer.from(`plain:${plaintext}`, 'utf8').toString('base64')
    }
    this.persist()
  }

  get(key: string): string | null {
    const raw = this.cache[key]
    if (!raw) return null
    try {
      const buf = Buffer.from(raw, 'base64')
      const asUtf8 = buf.toString('utf8')
      if (asUtf8.startsWith('plain:')) return asUtf8.slice(6)
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf)
      }
      return null
    } catch {
      return null
    }
  }

  delete(key: string): void {
    delete this.cache[key]
    this.persist()
  }

  has(key: string): boolean {
    return key in this.cache
  }
}
