import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface TokenData {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
  obtained_at: number
}

const TOKEN_FILE = 'gsync-tokens.json'

function getStorePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, TOKEN_FILE)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function getEncryptionBackend(): string | null {
  if (typeof safeStorage.getSelectedStorageBackend === 'function') {
    return safeStorage.getSelectedStorageBackend()
  }
  return null
}

export function saveTokens(tokens: TokenData): void {
  const json = JSON.stringify(tokens)
  const storePath = getStorePath()

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json)
    const payload = JSON.stringify({ encrypted: encrypted.toString('base64') })
    writeFileSync(storePath, payload, 'utf-8')
  } else {
    console.warn('[tokenStore] safeStorage encryption not available — storing tokens unencrypted')
    writeFileSync(storePath, json, 'utf-8')
  }
}

export function loadTokens(): TokenData | null {
  const storePath = getStorePath()
  if (!existsSync(storePath)) return null

  try {
    const raw = readFileSync(storePath, 'utf-8')
    const parsed = JSON.parse(raw)

    if (parsed.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[tokenStore] Encrypted tokens found but safeStorage unavailable')
        return null
      }
      const buf = Buffer.from(parsed.encrypted, 'base64')
      const decrypted = safeStorage.decryptString(buf)
      return JSON.parse(decrypted) as TokenData
    }

    return parsed as TokenData
  } catch (err) {
    console.error('[tokenStore] Failed to load tokens:', err)
    return null
  }
}

export function clearTokens(): void {
  const storePath = getStorePath()
  try {
    if (existsSync(storePath)) {
      unlinkSync(storePath)
    }
  } catch (err) {
    console.warn('[tokenStore] Failed to delete token file:', err)
  }
}

/**
 * Get structured info about the token encryption state.
 * Used by auth:status handler and security self-audit.
 */
export function getTokenSecurityInfo(): {
  isEncrypted: boolean
  backend: string | null
  warning: string | null
} {
  const available = safeStorage.isEncryptionAvailable()
  const backend = getEncryptionBackend()
  let warning: string | null = null

  if (!available) {
    warning = 'Encryption not available — tokens stored without OS-level protection'
  } else if (backend === 'basic_text') {
    warning = 'Linux: safeStorage uses basic_text backend — tokens are not strongly encrypted'
  }

  return {
    isEncrypted: available && backend !== 'basic_text',
    backend,
    warning
  }
}

export function isTokenExpired(tokens: TokenData): boolean {
  const now = Date.now()
  const expiresAt = tokens.obtained_at + tokens.expires_in * 1000
  return now >= expiresAt - 60_000 // 1 minute buffer
}
