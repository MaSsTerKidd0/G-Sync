/**
 * Patch Notes Modal — shown once per version update.
 * Displays release highlights and a "Don't show until next update" checkbox.
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, FolderSync, Trash2, Share2, Wand2, X } from 'lucide-react'

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
              Release Notes
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            G-Sync <span className="font-mono">v{version}</span>
          </h2>
          <p className="text-sm text-white/70 mt-1">
            First public practice release — local-only, not yet OAuth-verified with Google.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
          <FeatureItem
            icon={<FolderSync size={16} className="text-g-primary dark:text-g-primary-dark" />}
            title="Syncable Folders"
            description="Pick any local folder and have it mirrored two-way with Google Drive in the background. Headline feature of v1.0.0."
          />
          <FeatureItem
            icon={<Trash2 size={16} className="text-g-accent" />}
            title="Trash-First Delete Flow"
            description="Safer deletes that go to a dedicated Trash view with Restore, Permanent Delete and Empty Trash actions."
          />
          <FeatureItem
            icon={<Share2 size={16} className="text-g-success dark:text-g-success-dark" />}
            title="Sharing & Account"
            description="Shared-with-me tab, share dialog with permission management, and a profile menu with storage plan info."
          />
          <FeatureItem
            icon={<Wand2 size={16} className="text-purple-500" />}
            title="Smart Cleanup Tools"
            description="Duplicate finder, large file browser, storage breakdown, plus star/unstar, zip downloads and a Google-style light/dark theme."
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
