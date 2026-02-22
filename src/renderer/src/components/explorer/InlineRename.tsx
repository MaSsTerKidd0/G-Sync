import { useState, useEffect, useRef } from 'react'

interface InlineRenameProps {
  currentName: string
  onSubmit: (newName: string) => void
  onCancel: () => void
}

export function InlineRename({ currentName, onSubmit, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Select name without extension
    const dot = currentName.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : currentName.length)
  }, [currentName])

  function submit() {
    if (submittedRef.current) return
    submittedRef.current = true
    const trimmed = value.trim()
    if (trimmed && trimmed !== currentName) {
      onSubmit(trimmed)
    } else {
      onCancel()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={submit}
      className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 text-sm px-1.5 py-0.5 rounded outline-none ring-1 ring-blue-500 dark:ring-blue-400 w-full min-w-0"
    />
  )
}
