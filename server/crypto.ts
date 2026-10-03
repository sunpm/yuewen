import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
export function keyring(): { version: number; keys: Record<string, string> } {
  const version = Number(process.env.KEY_ENCRYPTION_VERSION ?? '1')
  const keys = JSON.parse(process.env.KEY_ENCRYPTION_KEYS ?? '{}') as Record<string, string>
  if (
    !Number.isSafeInteger(version) ||
    !keys[version] ||
    Buffer.from(keys[version], 'base64').length !== 32
  )
    throw new Error('Invalid credential encryption configuration')
  return { version, keys }
}
export function encryptKey(value: string, userId: string, key: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv)
  cipher.setAAD(Buffer.from(userId))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url')).join('.')
}
export function decryptKey(value: string, userId: string, key: string): string {
  const parts = value.split('.').map((p) => Buffer.from(p, 'base64url'))
  if (parts.length !== 3) throw new Error('Invalid encrypted credential')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), parts[0])
  decipher.setAAD(Buffer.from(userId))
  decipher.setAuthTag(parts[1])
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8')
}
