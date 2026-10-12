import { z } from 'zod'
import { feedbackPayload } from '../../shared/feedback'
import { AppError } from '../weread'
import { hash, validateImage } from './storage'

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
  const input = feedbackPayload.parse(JSON.parse(raw))
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
