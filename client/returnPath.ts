export function safeReturn(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/settings?connection=account'
  const url = new URL(value, 'https://return.invalid')
  const path = url.pathname.replace(/^\/m\//, '/')
  if (
    !['/overview', '/report', '/shelf', '/notes', '/settings', '/archives'].includes(path) &&
    !/^\/archives\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(path)
  )
    return '/settings?connection=account'
  const params = new URLSearchParams()
  for (const key of ['range', 'view', 'book', 'month', 'connection', 'save', 'saveReport']) {
    const item = url.searchParams.get(key)
    if (item) params.set(key, item)
  }
  return path + (params.size ? `?${params}` : '')
}
