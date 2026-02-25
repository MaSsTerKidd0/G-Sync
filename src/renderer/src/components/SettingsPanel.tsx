/**
 * Settings Panel — Appearance, Sync, Files, Auth, Security, Data Management, About.
 * Now rendered as a main content view (no back button needed).
 */

import { useState, useEffect, useCallback } from 'react'
import { Sun, Moon, Monitor, Loader2, Shield, Database, Info, RefreshCw, Lock, Eye } from 'lucide-react'
import { useTheme, type ThemeOption } from '../context/ThemeContext'

interface SecurityInfo {
  tokenEncrypted: boolean
  encryptionBackend: string | null
  warning: string | null
  dbPath: string
  dbSizeBytes: number
}

interface AppInfo {
  version: string
  electronVersion: string
  platform: string
}

interface BackupInfo {
  path: string
  sizeBytes: number
  createdAt: number
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

const THEME_OPTIONS: Array<{ value: ThemeOption; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' }
]

const POLLING_OPTIONS = [
  { value: '10000', label: '10 seconds' },
  { value: '30000', label: '30 seconds' },
  { value: '60000', label: '1 minute' },
  { value: '300000', label: '5 minutes' }
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-g-primary' : 'bg-g-border dark:bg-g-border-dark'
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

export default function SettingsPanel(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backingUp, setBackingUp] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  // ── User preferences ──
  const [settings, setSettings] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    try {
      const [sec, info, bk, prefs] = await Promise.all([
        window.gsync.settings.getSecurityInfo(),
        window.gsync.settings.getAppInfo(),
        window.gsync.settings.listBackups(),
        window.gsync.settings.getAll()
      ])
      setSecurityInfo(sec)
      setAppInfo(info)
      setBackups(bk)
      setSettings(prefs)
    } catch (err) {
      console.error('[settings] Failed to load data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSettingChange = async (key: string, value: string): Promise<void> => {
    await window.gsync.settings.set(key, value)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreateBackup = async (): Promise<void> => {
    setBackingUp(true)
    setBackupMessage(null)
    try {
      const result = await window.gsync.settings.createBackup()
      setBackupMessage(`Backup created successfully`)
      console.log('[settings] Backup created at:', result.path)
      const bk = await window.gsync.settings.listBackups()
      setBackups(bk)
    } catch (err) {
      setBackupMessage(`Backup failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBackingUp(false)
    }
  }

  const handleResetLocalData = async (): Promise<void> => {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }

    setResetting(true)
    try {
      await window.gsync.settings.resetLocalData()
      window.location.reload()
    } catch (err) {
      console.error('[settings] Reset failed:', err)
      setResetting(false)
      setResetConfirm(false)
    }
  }

  const handleOpenDataFolder = async (): Promise<void> => {
    await window.gsync.settings.openDataFolder()
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Appearance Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sun size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Appearance
          </h3>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Theme</span>
          <div className="flex items-center bg-g-btn-secondary dark:bg-g-btn-secondary-dark p-1 rounded-lg">
            {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all ${
                  theme === value
                    ? 'bg-g-bg dark:bg-g-border-dark shadow-sm text-g-primary dark:text-g-primary-dark font-medium'
                    : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sync Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Sync
          </h3>
        </div>

        <div className="space-y-4">
          {/* Polling interval */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Polling interval</span>
              <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-0.5">
                How often to check for Drive changes
              </p>
            </div>
            <select
              value={settings.polling_interval_ms ?? '30000'}
              onChange={(e) => handleSettingChange('polling_interval_ms', e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-g-btn-secondary dark:bg-g-btn-secondary-dark border border-g-border dark:border-g-border-dark text-sm text-g-text dark:text-g-text-dark focus:outline-none focus:ring-2 focus:ring-g-primary/40"
            >
              {POLLING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notify on sync complete */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Notify on sync complete</span>
              <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-0.5">
                Desktop notification when initial sync finishes
              </p>
            </div>
            <Toggle
              checked={settings.notify_on_sync_complete !== 'false'}
              onChange={(v) => handleSettingChange('notify_on_sync_complete', v ? 'true' : 'false')}
            />
          </div>
        </div>
      </section>

      {/* Files Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Files
          </h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Ignore hidden files</span>
            <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-0.5">
              Hide .git, .DS_Store, and similar in the explorer
            </p>
          </div>
          <Toggle
            checked={settings.ignore_hidden_files === 'true'}
            onChange={(v) => handleSettingChange('ignore_hidden_files', v ? 'true' : 'false')}
          />
        </div>
      </section>

      {/* Authentication Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Authentication
          </h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Keep me signed in</span>
            <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark mt-0.5">
              When disabled, tokens are cleared on app close
            </p>
          </div>
          <Toggle
            checked={settings.keep_signed_in !== 'false'}
            onChange={(v) => handleSettingChange('keep_signed_in', v ? 'true' : 'false')}
          />
        </div>
      </section>

      {/* Security Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Security
          </h3>
        </div>

        {securityInfo ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Token encryption</span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    securityInfo.tokenEncrypted ? 'bg-g-success dark:bg-g-success-dark' : 'bg-g-accent dark:bg-g-accent-dark'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    securityInfo.tokenEncrypted ? 'text-g-success dark:text-g-success-dark' : 'text-g-accent dark:text-g-accent-dark'
                  }`}
                >
                  {securityInfo.tokenEncrypted ? 'Encrypted' : 'Not encrypted'}
                </span>
              </div>
            </div>

            {securityInfo.encryptionBackend && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Encryption backend</span>
                <span className="text-sm text-g-text dark:text-g-text-dark font-mono">
                  {securityInfo.encryptionBackend}
                </span>
              </div>
            )}

            {securityInfo.warning && (
              <div className="mt-2 p-3 rounded-lg bg-g-accent/10 dark:bg-g-accent-dark/10 border border-g-accent/20 dark:border-g-accent-dark/30">
                <p className="text-xs text-g-accent dark:text-g-accent-dark">{securityInfo.warning}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-g-border dark:border-g-border-dark">
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Database size</span>
              <span className="text-sm text-g-text dark:text-g-text-dark">{formatSize(securityInfo.dbSizeBytes)}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-g-text-disabled dark:text-g-text-disabled-dark">Loading security info...</div>
        )}
      </section>

      {/* Data Management Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">
            Data Management
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={handleCreateBackup}
                disabled={backingUp}
                className="px-4 py-2 bg-g-primary hover:bg-g-primary/90 disabled:bg-g-primary/50 disabled:cursor-not-allowed text-sm font-medium text-white rounded-lg transition-colors"
              >
                {backingUp ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin h-3.5 w-3.5" />
                    Backing up...
                  </span>
                ) : (
                  'Create Backup'
                )}
              </button>

              <button
                onClick={handleOpenDataFolder}
                className="px-4 py-2 text-sm font-medium text-g-text dark:text-g-text-dark hover:text-g-text dark:hover:text-white border border-g-border dark:border-g-border-dark hover:border-g-text-disabled dark:hover:border-g-text-disabled-dark rounded-lg transition-colors"
              >
                Open Data Folder
              </button>
            </div>

            {backupMessage && (
              <p
                className={`text-xs mt-1 ${
                  backupMessage.startsWith('Backup failed') ? 'text-g-secondary dark:text-g-secondary-dark' : 'text-g-success dark:text-g-success-dark'
                }`}
              >
                {backupMessage}
              </p>
            )}

            {backups.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark mb-2">
                  Recent backups (last {backups.length}):
                </p>
                <div className="space-y-1">
                  {backups.map((b) => (
                    <div
                      key={b.path}
                      className="flex items-center justify-between text-xs py-1.5 px-3 rounded bg-g-surface dark:bg-g-btn-secondary-dark/30"
                    >
                      <span className="text-g-text-secondary dark:text-g-text-secondary-dark">{formatDate(b.createdAt)}</span>
                      <span className="text-g-text-disabled dark:text-g-text-disabled-dark">{formatSize(b.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-g-border dark:border-g-border-dark">
            <div className="flex items-center gap-3">
              <button
                onClick={handleResetLocalData}
                disabled={resetting}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  resetConfirm
                    ? 'bg-g-secondary hover:bg-g-secondary/90 text-white'
                    : 'bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30 text-g-secondary dark:text-g-secondary-dark hover:bg-g-secondary/15 dark:hover:bg-g-secondary-dark/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {resetting
                  ? 'Resetting...'
                  : resetConfirm
                    ? 'Confirm Reset'
                    : 'Reset Local Data'}
              </button>
              {resetConfirm && !resetting && (
                <button
                  onClick={() => setResetConfirm(false)}
                  className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
            {resetConfirm && (
              <p className="text-xs text-g-secondary dark:text-g-secondary-dark/80 mt-2">
                This will delete all local data, disconnect your account, and return the app to its
                initial state. This action cannot be undone.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="mb-6 rounded-xl bg-g-bg dark:bg-g-btn-secondary-dark/50 border border-g-border dark:border-g-border-dark p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info size={16} className="text-g-text-disabled dark:text-g-text-disabled-dark" />
          <h3 className="text-sm font-semibold text-g-text dark:text-g-text-dark uppercase tracking-wide">About</h3>
        </div>

        {appInfo ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">G-Sync version</span>
              <span className="text-sm text-g-text dark:text-g-text-dark font-mono">{appInfo.version}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Electron</span>
              <span className="text-sm text-g-text dark:text-g-text-dark font-mono">{appInfo.electronVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-g-text-secondary dark:text-g-text-secondary-dark">Platform</span>
              <span className="text-sm text-g-text dark:text-g-text-dark font-mono">{appInfo.platform}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-g-text-disabled dark:text-g-text-disabled-dark">Loading...</div>
        )}
      </section>
    </div>
  )
}
