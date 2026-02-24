import { useState, useEffect, useMemo, useCallback } from 'react'

export interface OpsStatusState {
  counts: Record<string, number>
  recentOps: OpRecordBridge[]
  pendingFileIds: Set<string>
  needsUserFileIds: Set<string>
  retry: (opId: string) => Promise<void>
  rollback: (opId: string) => Promise<void>
  cancel: (opId: string) => Promise<void>
  clearCompleted: () => Promise<void>
}

export function useOpsStatus(): OpsStatusState {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [recentOps, setRecentOps] = useState<OpRecordBridge[]>([])

  const refresh = useCallback(() => {
    window.gsync.ops.getCounts().then(setCounts)
    window.gsync.ops.listOps({ limit: 50, offset: 0 }).then(setRecentOps)
  }, [])

  // Initial fetch
  useEffect(() => {
    refresh()
  }, [refresh])

  // Subscribe to ops events
  useEffect(() => {
    const unsub1 = window.gsync.ops.onOpsChanged(() => refresh())
    const unsub2 = window.gsync.ops.onOpsProgress(() => refresh())
    const unsub3 = window.gsync.ops.onOpsError(() => refresh())
    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [refresh])

  const pendingFileIds = useMemo(() => {
    const ids = new Set<string>()
    for (const op of recentOps) {
      if (op.status === 'pending' || op.status === 'in_flight') {
        ids.add(op.fileId)
      }
    }
    return ids
  }, [recentOps])

  const needsUserFileIds = useMemo(() => {
    const ids = new Set<string>()
    for (const op of recentOps) {
      if (op.status === 'needs_user' || op.status === 'failed') {
        ids.add(op.fileId)
      }
    }
    return ids
  }, [recentOps])

  const retry = useCallback(async (opId: string) => {
    await window.gsync.ops.retry(opId)
  }, [])

  const rollback = useCallback(async (opId: string) => {
    await window.gsync.ops.rollback(opId)
  }, [])

  const cancel = useCallback(async (opId: string) => {
    await window.gsync.ops.cancel(opId)
  }, [])

  const clearCompleted = useCallback(async () => {
    await window.gsync.ops.clearCompleted()
  }, [])

  return { counts, recentOps, pendingFileIds, needsUserFileIds, retry, rollback, cancel, clearCompleted }
}
