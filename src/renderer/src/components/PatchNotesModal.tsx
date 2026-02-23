/**
 * Patch Notes Modal — shown once per version update.
 * Displays release highlights and a "Don't show until next update" checkbox.
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Star, Download, RefreshCw, X } from 'lucide-react'

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
        className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-8 text-white">
          <button
            onClick={() => onDismiss(dontShow)}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={20} className="text-blue-200" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
              Release Notes
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            G-Sync <span className="font-mono">v{version}</span>
          </h2>
          <p className="text-sm text-blue-200 mt-1">
            The first official release is here!
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
          <FeatureItem
            icon={<Star size={16} className="text-amber-500" />}
            title="Star & Unstar Files"
            description="Quickly star your important files directly from the explorer. Stars sync back to Google Drive."
          />
          <FeatureItem
            icon={<Download size={16} className="text-green-500" />}
            title="File Downloads"
            description="Download single files or select multiple items and download them as a zip archive."
          />
          <FeatureItem
            icon={<RefreshCw size={16} className="text-blue-500" />}
            title="Sync Enhancements"
            description="Configurable polling interval, manual Sync Now button, and desktop notifications on sync completion."
          />
          <FeatureItem
            icon={<Sparkles size={16} className="text-purple-500" />}
            title="Smart Tools & Theming"
            description="Duplicate finder, large file browser, storage breakdown, and a polished light/dark/system theme."
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500/40 bg-white dark:bg-gray-700"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Don't show until next update
            </span>
          </label>
          <button
            ref={btnRef}
            onClick={() => onDismiss(dontShow)}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
      <div className="mt-0.5 p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/50 shrink-0">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}
