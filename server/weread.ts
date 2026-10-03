export const SKILL_VERSION = '1.0.4'
const allowed = [
  '/shelf/sync',
  '/readdata/detail',
  '/user/notebooks',
  '/book/bookmarklist',
  '/review/list/mine',
  '/book/info',
  '/book/getprogress',
  '/book/chapterinfo',
] as const
export type WeReadEndpoint = (typeof allowed)[number]
export type JsonObject = Record<string, unknown>
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryable = false,
    public retryAfter?: number,
  ) {
    super(message)
  }
}

export async function weread(
  apiKey: string,
  api: WeReadEndpoint,
  params: JsonObject = {},
  fetcher = fetch,
): Promise<JsonObject> {
  if (!allowed.includes(api)) throw new AppError('INVALID_INPUT', '不支持的请求。', 400)
  let response: Response
  try {
    response = await fetcher('https://i.weread.qq.com/api/agent/gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...params, api_name: api, skill_version: SKILL_VERSION }),
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new AppError('UPSTREAM_TIMEOUT', '微信读书暂时无法连接，请稍后重试。', 504, true)
  }
  if (response.status === 429) {
    const value = response.headers.get('retry-after')
    const seconds = value ? Number(value) || Math.ceil((Date.parse(value) - Date.now()) / 1000) : 60
    throw new AppError(
      'UPSTREAM_RATE_LIMIT',
      '读取过于频繁，请稍后继续。',
      429,
      true,
      Number.isFinite(seconds) ? Math.max(1, seconds) : 60,
    )
  }
  let data: JsonObject
  try {
    data = (await response.json()) as JsonObject
  } catch {
    throw new AppError('UPSTREAM_RESPONSE', '微信读书返回了无法识别的内容。', 502, true)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new AppError('UPSTREAM_RESPONSE', '微信读书返回了无法识别的内容。', 502, true)
  if (data.upgrade_info)
    throw new AppError('UPSTREAM_UPGRADE', '阅读服务正在升级适配，请稍后再试。', 503)
  if (response.status === 401)
    throw new AppError('WEREAD_KEY_INVALID', '微信读书 API Key 无效，请重新配置。', 409)
  if (!response.ok || (data.errcode !== undefined && data.errcode !== 0)) {
    // Only HTTP 401 is verified as credential rejection. Unknown business errors never invalidate a saved key.
    throw new AppError(
      'UPSTREAM_ERROR',
      '微信读书暂时无法完成读取，请稍后重试。',
      502,
      response.status >= 500,
    )
  }
  return data
}
