import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type ThemeOption = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeOption
  setTheme: (t: ThemeOption) => void
  resolved: ResolvedTheme
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'gsync-theme'

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(option: ThemeOption): ResolvedTheme {
  return option === 'system' ? getSystemTheme() : option
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeOption>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
  })

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(theme))

  // Apply dark class to <html>
  useEffect(() => {
    const r = resolve(theme)
    setResolved(r)
    if (r === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const r = getSystemTheme()
      setResolved(r)
      if (r === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((t: ThemeOption) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
