import { ref } from 'vue'
const dark = ref(document.documentElement.classList.contains('dark'))
export function useTheme() {
  const toggle = () => {
    dark.value = !dark.value
    document.documentElement.classList.toggle('dark', dark.value)
    try {
      localStorage.setItem('yuewen-theme', dark.value ? 'dark' : 'light')
    } catch {
      /* Theme remains usable without storage. */
    }
  }
  return { dark, toggle }
}
