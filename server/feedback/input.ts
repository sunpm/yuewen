import { z } from 'zod'
import { isRangeKey } from '../../shared/report'
import { AppError } from '../weread'
import { hash, validateImage } from './storage'

const environment = z
  .object({
    entry: z.literal('pc'),
    path: z.enum(['/', '/demo', '/overview', '/shelf', '/notes', '/report', '/settings', '/login']),
    source: z.enum(['mock', 'guest', 'account', 'none']),
    range: z.string().refine(isRangeKey).optional(),
    view: z.enum(['overview', 'bookshelf', 'notes', 'insights']).optional(),
    theme: z.enum(['light', 'dark', 'unknown']),
    viewport: z
      .object({
        width: z.number().int().min(1).max(32768),
        height: z.number().int().min(1).max(32768),
      })
      .strict(),
    dpr: z.number().min(0.1).max(10),
    language: z
      .string()
      .max(35)
      .regex(/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/)
      .optional(),
    timezone: z
      .string()
      .max(64)
      .refine((value) => value === 'UTC' || Intl.supportedValuesOf('timeZone').includes(value))
      .optional(),
    browser: z.enum(['Chrome', 'Edge', 'Firefox', 'Safari', 'other', 'unknown']).optional(),
    browserVersion: z
      .string()
      .max(30)
      .regex(/^\d+(?:\.\d+){0,3}$/)
      .optional(),
    os: z.enum(['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'other', 'unknown']).optional(),
    clientVersion: z
      .string()
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .optional(),
    clientTime: z.iso.datetime().optional(),
    error: z
      .object({
        code: z
          .string()
          .max(64)
          .regex(/^[A-Z_]+$/),
        stage: z.enum(['connection', 'login', 'collection', 'report', 'export', 'feedback']),
        requestId: z.string().uuid().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
const payload = z
  .object({
    description: z.string().trim().min(1).max(4000),
    steps: z.string().trim().max(4000).default(''),
    contact: z.string().trim().max(200).default(''),
    environment,
  })
  .strict()

export async function parseSubmission(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new AppError('INVALID_INPUT', '反馈表单格式不正确。', 400)
  }
  for (const key of form.keys()) {
    if (
      !['contextId', 'requestId', 'payload', 'screenshot'].includes(key) ||
      form.getAll(key).length !== 1
    )
      throw new AppError('INVALID_INPUT', '反馈表单字段不正确。', 400)
  }
  const contextId = z.string().uuid().parse(form.get('contextId'))
  const requestId = z.string().uuid().parse(form.get('requestId'))
  const raw = z.string().parse(form.get('payload'))
  if (Buffer.byteLength(raw) > 32768) throw new AppError('INVALID_INPUT', '反馈内容过大。', 413)
  const input = payload.parse(JSON.parse(raw))
  if (Buffer.byteLength(JSON.stringify(input.environment)) > 16384)
    throw new AppError('INVALID_INPUT', '环境信息过大。', 413)
  const file = form.get('screenshot')
  if (file !== null && !(file instanceof File))
    throw new AppError('INVALID_SCREENSHOT', '截图格式不正确。', 400)
  const image = file
    ? await validateImage(Buffer.from(await file.arrayBuffer()), file.type)
    : undefined
  return {
    contextId,
    requestId,
    input,
    image,
    digest: hash(JSON.stringify({ ...input, image: image?.digest ?? null })),
  }
}
