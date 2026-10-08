// View controls stay in memory; neither searches nor report text enter history storage.
export interface ViewSnapshot {
  section: '时间' | '偏好' | '书架' | '笔记'
  search: string
  category: string
  sort: string
  list: boolean
  noteType: string
  noteLimit: number
  includeNotes: boolean
  scroll: number
}
export const views = new Map<string, ViewSnapshot>()
let currentOwner = ''
let generation = 0
export const viewVersion = () => generation
export function clearViews() {
  generation++
  views.clear()
}
export function selectViewOwner(owner: string) {
  if (currentOwner !== owner) clearViews()
  currentOwner = owner
}
export function saveView(key: string, snapshot: ViewSnapshot, version: number) {
  if (version !== generation) return
  views.set(key, snapshot)
  // ponytail: retain 24 visited entries in memory; older navigation uses default controls.
  if (views.size > 24) views.delete(views.keys().next().value as string)
}
