/**
 * Phase 5: Smart Tools Dashboard — Tab-based container for cleanup tools.
 *
 * Three tabs:
 * 1. Duplicates — Find and review duplicate files
 * 2. Large Files — Identify storage hogs
 * 3. Storage — Category breakdown + activity timeline
 */

import { useState } from 'react'
import DuplicatesTab from './DuplicatesTab'
import LargeFilesTab from './LargeFilesTab'
import StorageTab from './StorageTab'

type Tab = 'duplicates' | 'large-files' | 'storage'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'duplicates', label: 'Duplicates', icon: '📋' },
  { id: 'large-files', label: 'Large Files', icon: '📦' },
  { id: 'storage', label: 'Storage', icon: '📊' }
]

export default function CleanupDashboard(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('duplicates')

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-g-border dark:border-g-border-dark bg-g-surface dark:bg-g-btn-secondary-dark/50 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                ? 'bg-g-primary/8 dark:bg-g-primary-dark/10 text-g-primary dark:text-g-primary-dark border border-g-primary/20 dark:border-g-primary-dark/30'
                : 'text-g-text-secondary dark:text-g-text-secondary-dark hover:text-g-text dark:hover:text-g-text-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark/50 border border-transparent'
              }
            `}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'duplicates' && <DuplicatesTab />}
        {activeTab === 'large-files' && <LargeFilesTab />}
        {activeTab === 'storage' && <StorageTab />}
      </div>
    </div>
  )
}
