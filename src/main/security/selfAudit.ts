/**
 * Phase 7: Security Self-Audit Utility.
 *
 * Runs at startup to verify that BrowserWindow security settings
 * and token encryption are properly configured. Logs warnings
 * if anything is misconfigured. Does NOT block the app.
 */

import { BrowserWindow } from 'electron'
import { getTokenSecurityInfo } from '../auth/tokenStore'

export interface AuditResult {
  check: string
  pass: boolean
  detail: string
}

/**
 * Audit the main BrowserWindow's security posture.
 */
export function auditMainWindow(win: BrowserWindow): AuditResult[] {
  const results: AuditResult[] = []

  // Read webPreferences from the live webContents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getWP = (win.webContents as any).getWebPreferences
  const wp = typeof getWP === 'function' ? getWP.call(win.webContents) : ({} as Record<string, unknown>)

  // 1. Sandbox
  results.push({
    check: 'sandbox',
    pass: wp.sandbox === true,
    detail: wp.sandbox ? 'Renderer sandbox enabled' : 'WARN: renderer sandbox is disabled'
  })

  // 2. Context isolation
  results.push({
    check: 'contextIsolation',
    pass: wp.contextIsolation === true,
    detail: wp.contextIsolation
      ? 'Context isolation enabled'
      : 'WARN: context isolation is disabled — preload scripts share the renderer context'
  })

  // 3. Node integration (should be false)
  results.push({
    check: 'nodeIntegration',
    pass: wp.nodeIntegration === false || wp.nodeIntegration === undefined,
    detail: !wp.nodeIntegration
      ? 'Node integration disabled in renderer'
      : 'WARN: nodeIntegration is enabled — renderer has full Node.js access'
  })

  // 4. webSecurity (should not be disabled)
  results.push({
    check: 'webSecurity',
    pass: wp.webSecurity !== false,
    detail: wp.webSecurity !== false
      ? 'Web security enabled (same-origin policy enforced)'
      : 'WARN: webSecurity is disabled — same-origin policy is off'
  })

  // 5. Token encryption
  const tokenSec = getTokenSecurityInfo()
  results.push({
    check: 'tokenEncryption',
    pass: tokenSec.isEncrypted,
    detail: tokenSec.warning ?? 'Token encryption backend is strong'
  })

  return results
}

/**
 * Log audit results to the console.
 */
export function logAuditResults(results: AuditResult[]): void {
  const failures = results.filter((r) => !r.pass)

  if (failures.length === 0) {
    console.log('[security] All audit checks passed (%d checks)', results.length)
  } else {
    console.warn('[security] %d of %d audit check(s) need attention:', failures.length, results.length)
    for (const f of failures) {
      console.warn('  [WARN] %s: %s', f.check, f.detail)
    }
    // Still log passed checks at debug level
    for (const r of results.filter((r) => r.pass)) {
      console.log('  [OK]   %s: %s', r.check, r.detail)
    }
  }
}
