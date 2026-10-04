export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => {
    throw new ApiError('SERVICE_ERROR', '服务暂时不可用，请稍后重试。')
  })
  if (!response.ok)
    throw new ApiError(
      data.code ?? 'SERVICE_ERROR',
      data.message ?? '服务暂时不可用，请稍后重试。',
      data.details,
    )
  return data as T
}
