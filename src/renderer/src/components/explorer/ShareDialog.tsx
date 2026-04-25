import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, UserPlus, Loader2, Shield, Pencil, Eye, MessageSquare, Crown } from 'lucide-react'
import type { DriveItemDTO } from '../../types/explorer'

interface Permission {
  id: string
  type: string
  role: string
  emailAddress?: string
  displayName?: string
  photoLink?: string
  deleted?: boolean
}

interface ShareDialogProps {
  item: DriveItemDTO
  onClose: () => void
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  owner: { label: 'Owner', icon: <Crown size={12} className="text-g-accent" /> },
  writer: { label: 'Editor', icon: <Pencil size={12} /> },
  commenter: { label: 'Commenter', icon: <MessageSquare size={12} /> },
  reader: { label: 'Viewer', icon: <Eye size={12} /> }
}

export function ShareDialog({ item, onClose }: ShareDialogProps) {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'reader' | 'writer' | 'commenter'>('reader')
  const [sharing, setSharing] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.gsync.drive.listPermissions({ fileId: item.id })
      if (result.success) {
        setPermissions(result.permissions)
      } else {
        setError(result.error ?? 'Failed to load permissions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }, [item.id])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      onClose()
    }
  }, [onClose])

  const handleShare = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }

    // Check if already shared with this email
    if (permissions.some((p) => p.emailAddress?.toLowerCase() === trimmed)) {
      setError('Already shared with this email')
      return
    }

    setSharing(true)
    setError(null)
    try {
      const result = await window.gsync.drive.shareFile({
        fileId: item.id,
        email: trimmed,
        role
      })
      if (result.success) {
        setEmail('')
        await fetchPermissions()
      } else {
        setError(result.error ?? 'Failed to share')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share')
    } finally {
      setSharing(false)
    }
  }

  const handleRemovePermission = async (permissionId: string) => {
    setRemoving(permissionId)
    setError(null)
    try {
      const result = await window.gsync.drive.unshareFile({
        fileId: item.id,
        permissionId
      })
      if (result.success) {
        setPermissions((prev) => prev.filter((p) => p.id !== permissionId))
      } else {
        setError(result.error ?? 'Failed to remove access')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove access')
    } finally {
      setRemoving(null)
    }
  }

  // Separate owner from other permissions
  const ownerPermission = permissions.find((p) => p.role === 'owner')
  const sharedPermissions = permissions.filter((p) => p.role !== 'owner' && !p.deleted)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md bg-g-bg dark:bg-g-surface-dark rounded-2xl shadow-2xl border border-g-border dark:border-g-border-dark overflow-hidden animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-g-text dark:text-g-text-dark">
              Share &ldquo;{item.name}&rdquo;
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-text-secondary dark:hover:text-g-text-secondary-dark hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Add people section — only if user can share */}
        {item.canShare && (
          <div className="px-5 pb-4">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="email"
                placeholder="Add email address..."
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleShare() }}
                disabled={sharing}
                className="flex-1 px-3 py-2 text-sm bg-g-surface dark:bg-g-btn-secondary-dark border border-g-border dark:border-g-border-dark rounded-lg text-g-text dark:text-g-text-dark placeholder:text-g-text-disabled dark:placeholder:text-g-text-disabled-dark focus:outline-none focus:ring-2 focus:ring-g-primary/40 dark:focus:ring-g-primary-dark/40 transition disabled:opacity-50"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'reader' | 'writer' | 'commenter')}
                disabled={sharing}
                className="px-2 py-2 text-xs bg-g-surface dark:bg-g-btn-secondary-dark border border-g-border dark:border-g-border-dark rounded-lg text-g-text dark:text-g-text-dark focus:outline-none focus:ring-2 focus:ring-g-primary/40 dark:focus:ring-g-primary-dark/40 transition disabled:opacity-50"
              >
                <option value="reader">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="writer">Editor</option>
              </select>
              <button
                onClick={handleShare}
                disabled={sharing || !email.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-g-primary dark:bg-g-primary-dark text-white rounded-lg hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sharing ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Share
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 text-xs text-g-secondary dark:text-g-secondary-dark bg-g-secondary/8 dark:bg-g-secondary-dark/10 border border-g-secondary/20 dark:border-g-secondary-dark/30 rounded-lg">
            {error}
          </div>
        )}

        {/* Permissions list */}
        <div className="px-5 pb-5">
          <p className="text-[10px] font-bold text-g-text-disabled dark:text-g-text-disabled-dark uppercase tracking-wider mb-2">
            People with access
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-g-primary dark:text-g-primary-dark" />
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {/* Owner */}
              {ownerPermission && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-g-surface dark:bg-g-btn-secondary-dark/50">
                  <div className="w-8 h-8 rounded-full bg-g-accent/15 flex items-center justify-center text-g-accent text-xs font-bold flex-shrink-0">
                    {(ownerPermission.displayName ?? ownerPermission.emailAddress ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-g-text dark:text-g-text-dark truncate">
                      {ownerPermission.displayName ?? ownerPermission.emailAddress ?? 'Unknown'}
                    </p>
                    {ownerPermission.emailAddress && ownerPermission.displayName && (
                      <p className="text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark truncate">
                        {ownerPermission.emailAddress}
                      </p>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-g-accent">
                    <Crown size={12} />
                    Owner
                  </span>
                </div>
              )}

              {/* Shared users */}
              {sharedPermissions.map((perm) => {
                const roleInfo = ROLE_LABELS[perm.role] ?? { label: perm.role, icon: <Shield size={12} /> }
                return (
                  <div
                    key={perm.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-g-surface dark:hover:bg-g-btn-secondary-dark/50 group transition"
                  >
                    <div className="w-8 h-8 rounded-full bg-g-primary/15 dark:bg-g-primary-dark/15 flex items-center justify-center text-g-primary dark:text-g-primary-dark text-xs font-bold flex-shrink-0">
                      {(perm.displayName ?? perm.emailAddress ?? '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-g-text dark:text-g-text-dark truncate">
                        {perm.displayName ?? perm.emailAddress ?? 'Unknown'}
                      </p>
                      {perm.emailAddress && perm.displayName && (
                        <p className="text-[10px] text-g-text-disabled dark:text-g-text-disabled-dark truncate">
                          {perm.emailAddress}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-g-text-secondary dark:text-g-text-secondary-dark">
                      {roleInfo.icon}
                      {roleInfo.label}
                    </span>
                    {item.canShare && (
                      <button
                        onClick={() => handleRemovePermission(perm.id)}
                        disabled={removing === perm.id}
                        className="p-1 text-g-text-disabled dark:text-g-text-disabled-dark hover:text-g-secondary dark:hover:text-g-secondary-dark opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                        title={`Remove ${perm.emailAddress ?? 'user'}`}
                      >
                        {removing === perm.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <X size={14} />
                        )}
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Empty state */}
              {sharedPermissions.length === 0 && !ownerPermission && (
                <div className="text-center py-6 text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
                  Not shared with anyone
                </div>
              )}
              {sharedPermissions.length === 0 && ownerPermission && (
                <div className="text-center py-4 text-xs text-g-text-disabled dark:text-g-text-disabled-dark">
                  Only the owner has access
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
