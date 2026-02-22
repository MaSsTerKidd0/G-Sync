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
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent'
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
