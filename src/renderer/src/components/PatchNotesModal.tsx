/**
 * Patch Notes Modal — shown once per version update.
 * Displays release highlights and a "Don't show until next update" checkbox.
 *
 * Content for v1.1.0:
 *   - Photos tab removed (Google API deprecated)
 *   - Synced-folder bugs fixed (no-op CASE, conflict preservation)
 *   - Expanded MIME types (HEIC, MOV, FLAC, etc.)
 *   - Force re-login on first launch
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Bug, ImageOff, FileType, ShieldCheck, X } from 'lucide-react'

interface PatchNotesModalProps {
  version: string
  onDismiss: (dontShowAgain: boolean) => void
}

export default function PatchNotesModal({ version, onDismiss }: PatchNotesModalProps) {
  const [dontShow, setDontShow] = useState(true)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    btnRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss(dontShow)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss, dontShow])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => onDismiss(dontShow)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />

      {/* Dialog */}
      <div
        className="relative bg-g-bg dark:bg-g-surface-dark border border-g-border dark:border-g-border-dark rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-g-primary to-g-primary/85 px-6 py-8 text-white">
          <button
            onClick={() => onDismiss(dontShow)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={20} className="text-white/70" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">
              What's New
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            G-Sync <span className="font-mono">v{version}</span>
          </h2>
          <p className="text-sm text-white/70 mt-1">
            Hardening release — Synced Folders is more reliable, plus a few
            housekeeping changes.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
          <FeatureItem
            icon={<Bug size={16} className="text-g-success dark:text-g-success-dark" />}
            title="Synced Folders bugs squashed"
            description="Files no longer re-upload when their content hasn't changed, and conflict markers stick around until you resolve them — no more silent overwrites when you keep editing a conflicted file."
          />
          <FeatureItem
            icon={<ImageOff size={16} className="text-g-text-secondary dark:text-g-text-secondary-dark" />}
            title="Photos tab removed"
            description="Google deprecated the Photos Library API for third-party apps in March 2025, so the Photos tab returned empty results for everyone. We've removed it; your image and video files are still in My Drive. May return via the new Picker API in a future release."
          />
          <FeatureItem
            icon={<FileType size={16} className="text-g-primary dark:text-g-primary-dark" />}
            title="More file types preview correctly"
            description="HEIC/HEIF (iPhone photos), MOV, MKV, FLAC, AAC, M4A, AVIF, BMP, TIFF, YAML, TOML and more now upload with the right content type, so Drive can generate previews and thumbnails."
          />
          <FeatureItem
            icon={<ShieldCheck size={16} className="text-g-accent" />}
            title="Fresh login on upgrade"
            description="You'll be asked to sign in again on first launch. Your previous tokens still carried the now-removed Photos permission — we replace them rather than keep stale grants."
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-g-border dark:border-g-border-dark flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-4 h-4 rounded border-g-border dark:border-g-border-dark text-g-primary focus:ring-g-primary/40 bg-g-bg dark:bg-g-btn-secondary-dark"
            />
            <span className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark">
              Don't show until next update
            </span>
          </label>
          <button
            ref={btnRef}
            onClick={() => onDismiss(dontShow)}
            className="px-5 py-2 text-sm font-medium text-white bg-g-primary hover:bg-g-primary/90 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-g-primary/40"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function FeatureItem({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 p-1.5 rounded-lg bg-g-surface dark:bg-g-btn-secondary-dark/50 shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-g-text dark:text-g-text-dark">{title}</h4>
        <p className="text-xs text-g-text-secondary dark:text-g-text-secondary-dark mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}
