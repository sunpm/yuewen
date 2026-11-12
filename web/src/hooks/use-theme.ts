import { useEffect, useState } from 'react'

export type Theme = 'auto' | 'light' | 'dark'

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem('yuewen-theme')
    if (value === 'light' || value === 'dark') return value
  } catch {
    // Theme storage is optional.
  }
  return 'auto'
}

export function useTheme() {
  const [theme, setPreference] = useState<Theme>(storedTheme)

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && system.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#141A17' : '#F8F9F6')
    }
    const sync = (event: StorageEvent) => {
      if (event.key === 'yuewen-theme' || event.key === null) setPreference(storedTheme())
    }
    apply()
    system.addEventListener('change', apply)
    window.addEventListener('storage', sync)
    return () => {
      system.removeEventListener('change', apply)
      window.removeEventListener('storage', sync)
    }
  }, [theme])

  function setTheme(value: string) {
    if (value !== 'auto' && value !== 'light' && value !== 'dark') return
    setPreference(value)
    try {
      localStorage.setItem('yuewen-theme', value)
    } catch {
      // The selection still applies to this page when storage is unavailable.
    }
  }
  return { theme, setTheme }
}
