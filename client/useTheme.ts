import { ref, watch } from 'vue'
export type Theme = 'auto' | 'light' | 'dark'
const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
function stored(): Theme {
  try {
    const value = localStorage.getItem('yuewen-theme')
    if (value === 'light' || value === 'dark') return value
  } catch {
    /* Storage is optional. */
  }
  return 'auto'
}
const preference = ref<Theme>(stored())
const dark = ref(false)
function apply() {
  dark.value = preference.value === 'dark' || (preference.value === 'auto' && !!system?.matches)
  document.documentElement.classList.toggle('dark', dark.value)
  document.documentElement.style.colorScheme = dark.value ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark.value ? '#111213' : '#F5EFE3')
}
system?.addEventListener('change', apply)
window.addEventListener('storage', (event) => {
  if (event.key === 'yuewen-theme' || event.key === null) preference.value = stored()
})
watch(preference, apply, { immediate: true, flush: 'sync' })
export function useTheme() {
  function setTheme(value: Theme) {
    preference.value = value
    try {
      localStorage.setItem('yuewen-theme', value)
    } catch {
      /* Current page remains usable. */
    }
  }
  return { dark, preference, setTheme }
}
