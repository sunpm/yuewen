import { createHash } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { AppError } from '../weread'

export const MAX_IMAGE_BYTES = 1024 * 1024
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export const r2Configured = () =>
  ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every(
    (key) => !!process.env[key],
  )
let client: S3Client | undefined
function r2() {
  if (!r2Configured())
    throw new AppError(
      'SCREENSHOT_UNAVAILABLE',
      '截图服务暂不可用，可移除截图后重新确认提交。',
      503,
      true,
    )
  return (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }))
}
export async function validateImage(bytes: Buffer, declaredMime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new AppError('SCREENSHOT_TOO_LARGE', '截图需不超过 1 MiB，可移除截图后提交文字。', 413)
  try {
    const image = sharp(bytes, {
      limitInputPixels: 4_000_000,
      failOn: 'warning',
      animated: true,
    }).timeout({ seconds: 3 })
    const meta = await image.metadata()
    const mime =
      meta.format === 'png'
        ? 'image/png'
        : meta.format === 'jpeg'
          ? 'image/jpeg'
          : meta.format === 'webp'
            ? 'image/webp'
            : ''
    if (
      !mime ||
      mime !== declaredMime ||
      (meta.pages ?? 1) !== 1 ||
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > 4_000_000
    )
      throw new Error('Invalid screenshot')
    // Decode all pixels as well as inspecting the header; never trust a filename or MIME alone.
    await image.raw().toBuffer()
    return { bytes, mime, width: meta.width, height: meta.height, digest: hash(bytes) }
  } catch {
    throw new AppError(
      'INVALID_SCREENSHOT',
      '截图必须是有效的单帧 PNG、JPEG 或 WebP，且不超过 400 万像素。',
      400,
    )
  }
}
export async function putScreenshot(key: string, bytes: Buffer, mime: string) {
  await r2().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: mime,
      ContentLength: bytes.length,
      CacheControl: 'private, no-store',
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  )
}
export async function readScreenshot(key: string, expectedBytes: number) {
  try {
    const signal = AbortSignal.timeout(10_000)
    const result = await r2().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
      { abortSignal: signal },
    )
    if (!result.Body) throw new AppError('SCREENSHOT_GONE', '截图已删除或过期。', 410)
    const reader = result.Body.transformToWebStream().getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_IMAGE_BYTES || size > expectedBytes) throw new Error('Invalid object size')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    if (size !== expectedBytes) throw new Error('Invalid object size')
    return Buffer.concat(chunks)
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchKey')
      throw new AppError('SCREENSHOT_GONE', '截图已删除或过期。', 410)
    throw error
  }
}
export async function deleteScreenshot(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }), {
    abortSignal: AbortSignal.timeout(5_000),
  })
}
export async function listScreenshots(cursor?: string) {
  return r2().send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: 'feedback/',
      MaxKeys: 100,
      ContinuationToken: cursor,
    }),
    { abortSignal: AbortSignal.timeout(5_000) },
  )
}
