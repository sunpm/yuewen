import { isRangeKey } from '@shared/report'
import { z } from 'zod'
import type { ViewSnapshot } from '@/lib/view-memory'

declare const __PC_ANALYTICS__: { origin: string; token: string } | null

// The build embeds a site token only for an explicitly enabled production deploy.
const config = typeof __PC_ANALYTICS__ === 'undefined' ? null : __PC_ANALYTICS__
const configured = !import.meta.env.DEV && !!config && window.location.origin === config.origin
const entryKey = 'yuewen-private-entry'
const viewSchema = z.object({
  section: z.enum(['时间', '偏好', '书架', '笔记']),
  category: z.string().max(100),
  sort: z.enum(['recent', 'title', 'progress']),
  list: z.boolean(),
  noteType: z.enum(['全部', 'highlight', 'thought', 'bookmark']),
  noteLimit: z.number().int().min(24).max(10000),
  includeNotes: z.boolean(),
  expandedModules: z.array(z.number().int().min(1).max(27)).max(27),
  scroll: z.number().min(0).max(10_000_000),
})
const entrySchema = z.object({
  url: z.string().max(2000),
  expires: z.number(),
  scroll: z.number().min(0).max(10_000_000),
  view: viewSchema.optional(),
})

function publicPage(url: URL) {
  if (url.origin !== window.location.origin || url.hash) return false
  if (url.pathname === '/') return !url.search
  if (!['/demo', '/demo/'].includes(url.pathname)) return false
  for (const [key, value] of url.searchParams) {
    if (url.searchParams.getAll(key).length !== 1) return false
    if (key === 'range' && isRangeKey(value)) continue
    if (key === 'view' && ['overview', 'report', 'shelf', 'notes'].includes(value)) continue
    if (key === 'source' && value === 'mock') continue
    // Detail/filter URLs use an untracked document; no arbitrary identifiers enter analytics.
    return false
  }
  return true
}

// Never enable a beacon later in a document that has held private data or input.
export const analyticsDocument =
  configured &&
  publicPage(new URL(window.location.href)) &&
  (!document.referrer || publicPage(new URL(document.referrer)))

let publicView: z.infer<typeof viewSchema> | undefined
export function rememberPublicView(view: ViewSnapshot) {
  if (analyticsDocument) publicView = viewSchema.safeParse(view).data
}

function readEntry() {
  try {
    const raw = sessionStorage.getItem(entryKey)
    sessionStorage.removeItem(entryKey)
    if (!raw || raw.length > 8000) return
    const parsed = entrySchema.safeParse(JSON.parse(raw))
    if (
      parsed.success &&
      parsed.data.url === window.location.href &&
      parsed.data.expires > Date.now() &&
      new URL(window.location.href).searchParams.get('analytics') === 'off'
    )
      return parsed.data
  } catch {
    // Storage restrictions must not prevent opening feedback or entering text.
  }
}
const entry = readEntry()
const initialURL = new URL(window.location.href)
let restored = false
let entering = false
export function privateEntryPending() {
  const current = new URL(window.location.href)
  return (
    !restored &&
    !analyticsDocument &&
    current.pathname === initialURL.pathname &&
    current.searchParams.get('analytics') === 'off' &&
    ['view', 'source'].every(
      (key) => current.searchParams.get(key) === initialURL.searchParams.get(key),
    ) &&
    (current.searchParams.get('range') ?? 'recent') ===
      (initialURL.searchParams.get('range') ?? 'recent') &&
    ['feedback', 'search'].some((action) => initialURL.searchParams.get(action) === 'open')
  )
}
export const resumedPublicView = () =>
  privateEntryPending() && entry?.view
    ? { ...entry.view, scroll: entry.scroll, search: '' }
    : undefined

export function enterPrivateDocument(action: 'feedback' | 'search') {
  if (!analyticsDocument) return false
  if (entering) return true
  entering = true
  const target = new URL(window.location.href)
  target.searchParams.set('analytics', 'off')
  target.searchParams.set(action, 'open')
  try {
    sessionStorage.setItem(
      entryKey,
      JSON.stringify({
        url: target.href,
        expires: Date.now() + 60_000,
        scroll: window.scrollY,
        view: publicView,
      }),
    )
  } catch {
    // The URL still opens the requested control if session storage is unavailable.
  }
  window.location.assign(target.href)
  return true
}

export function restorePrivateEntry() {
  if (!privateEntryPending()) return
  restored = true
  if (entry) window.scrollTo(0, entry.scroll)
  if (initialURL.searchParams.get('feedback') === 'open')
    window.dispatchEvent(new Event('yuewen:feedback-ready'))
  else if (initialURL.searchParams.get('search') === 'open')
    document.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true })
}

export function startAnalytics() {
  if (!configured) return
  window.addEventListener('pageshow', () => {
    // A public document restored from bfcache must be able to open a private entry again.
    entering = false
  })
  // Install before React Router and the beacon. No private URL enters this document's history.
  // Public route/view changes are full navigations; filters stay local and do not add PVs.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history)
    window.history[method] = (state, unused, url) => {
      if (url != null) {
        const target = new URL(url, window.location.href)
        const current = new URL(window.location.href)
        if (
          (analyticsDocument &&
            (!publicPage(target) ||
              target.pathname !== current.pathname ||
              target.searchParams.get('view') !== current.searchParams.get('view'))) ||
          (!analyticsDocument && publicPage(target) && !publicPage(current))
        ) {
          if (method === 'replaceState') window.location.replace(target.href)
          else window.location.assign(target.href)
          return
        }
      }
      original(state, unused, url)
    }
  }
  if (!analyticsDocument || !config) return
  const script = document.createElement('script')
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.async = true
  script.referrerPolicy = 'no-referrer'
  script.dataset.cfBeacon = JSON.stringify({ token: config.token, spa: false })
  // One attempt per document, outside React/StrictMode. Loading never gates the application.
  document.head.append(script)
}
