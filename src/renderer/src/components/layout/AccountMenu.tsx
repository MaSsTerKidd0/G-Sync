/**
 * AccountMenu — Google-style account popup anchored below the avatar button.
 * Renders via createPortal to avoid z-index issues.
 * Contains: user info, theme toggle, navigation items, disconnect.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sun, Moon, Monitor, Settings, ExternalLink, LogOut } from 'lucide-react'
import { useTheme, type ThemeOption } from '../../context/ThemeContext'

interface AccountMenuProps {
  anchorRect: DOMRect
  userName: string
  userEmail: string
  userPhoto?: string
  onNavigateSettings: () => void
  onDisconnect: () => void
  onClose: () => void
}

const THEME_OPTIONS: Array<{ value: ThemeOption; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' }
]

export function AccountMenu({
  anchorRect,
  userName,
  userEmail,
  userPhoto,
  onNavigateSettings,
  onDisconnect,
  onClose
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Position: below and right-aligned to the anchor
  const top = anchorRect.bottom + 6
  const right = window.innerWidth - anchorRect.right

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 w-72 rounded-xl bg-g-bg dark:bg-g-surface-dark border border-g-border dark:border-g-border-dark shadow-xl shadow-black/10 dark:shadow-black/30 animate-fade-in"
      style={{ top, right }}
    >
      {/* User info header */}
      <div className="p-4 flex items-center gap-3">
        {userPhoto ? (
          <img
            src={userPhoto}
            alt=""
            className="w-10 h-10 rounded-full flex-shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-g-primary/15 dark:bg-g-primary-dark/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-g-primary dark:text-g-primary-dark">
              {userName?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-g-text dark:text-g-text-dark truncate">
            {userName || 'Google Account'}
          </p>
          <p className="text-xs text-g-text-disabled dark:text-g-text-disabled-dark truncate">
            {userEmail}
          </p>
        </div>
      </div>

      <div className="h-px bg-g-border dark:bg-g-border-dark" />

      {/* Theme toggle */}
      <div className="p-3">
        <p className="text-[10px] font-medium text-g-text-disabled dark:text-g-text-disabled-dark uppercase tracking-wide mb-2 px-1">
          Theme
        </p>
        <div className="flex items-center bg-g-btn-secondary dark:bg-g-btn-secondary-dark p-1 rounded-lg">
          {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-all ${
                theme === value
                  ? 'bg-g-bg dark:bg-g-border-dark shadow-sm text-g-primary dark:text-g-primary-dark font-medium'
                  : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-g-border dark:bg-g-border-dark" />

      {/* Menu items */}
      <div className="py-1">
        <button
          onClick={() => { onNavigateSettings(); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
        <button
          onClick={() => { window.open('https://one.google.com/about/plans', '_blank'); onClose() }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-g-text-secondary dark:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark transition-colors"
        >
          <ExternalLink size={16} />
          Manage Storage
        </button>
      </div>

      <div className="h-px bg-g-border dark:bg-g-border-dark" />

      {/* Disconnect */}
      <div className="p-2">
        <button
          onClick={() => { onDisconnect(); onClose() }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-g-secondary dark:text-g-secondary-dark hover:bg-g-secondary/8 dark:hover:bg-g-secondary-dark/10 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Disconnect
        </button>
      </div>
    </div>,
    document.body
  )
}
