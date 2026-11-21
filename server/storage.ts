import { AppError } from './weread'
export interface Entity<T> {
  version: number
  token: string
  value: T
}
export async function read<T>(db: D1Database, id: string): Promise<Entity<T> | null> {
  // One statement gives a consistent snapshot across all chunks.
  const { results } = await db
    .prepare(
      'SELECT e.version, e.token, c.value FROM entity e JOIN chunk c ON c.entity_id=e.id WHERE e.id=? ORDER BY c.part',
    )
    .bind(id)
    .all<{ version: number; token: string; value: string }>()
  if (!results.length) return null
  return {
    version: results[0].version,
    token: results[0].token,
    value: JSON.parse(results.map((x) => x.value).join('')) as T,
  }
}
export async function save(
  db: D1Database,
  id: string,
  expected: number,
  value: unknown,
  summary: unknown = {},
  expectedToken?: string,
) {
  const text = JSON.stringify(value),
    token = crypto.randomUUID()
  if (new TextEncoder().encode(text).length > 10 * 1024 * 1024)
    throw new AppError('STORAGE_LIMIT', '报告达到实例容量上限，请下载已有结果。', 413)
  const statements = [
    expected === 0
      ? db
          .prepare(
            "INSERT INTO entity(id,version,token,summary) SELECT ?,1,?,? WHERE ?='current' OR (SELECT count(*) FROM entity WHERE id!='current')<20 ON CONFLICT DO NOTHING",
          )
          .bind(id, token, JSON.stringify(summary), id)
      : db
          .prepare(
            'UPDATE entity SET version=version+1,token=?,summary=? WHERE id=? AND version=? AND token=?',
          )
          .bind(token, JSON.stringify(summary), id, expected, expectedToken ?? ''),
  ]
  statements.push(
    db
      .prepare(
        'DELETE FROM chunk WHERE entity_id=? AND EXISTS(SELECT 1 FROM entity WHERE id=? AND token=?)',
      )
      .bind(id, id, token),
  )
  // SQLite encodes each string separately: never split a UTF-16 surrogate pair.
  let part = 0
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + 32000, text.length)
    const last = text.charCodeAt(end - 1)
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--
    statements.push(
      db
        .prepare(
          'INSERT INTO chunk(entity_id,part,value) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM entity WHERE id=? AND token=?) ON CONFLICT DO NOTHING',
        )
        .bind(id, part++, text.slice(i, end), id, token),
    )
    i = end
  }
  const result = await db.batch(statements)
  if (!result[0].meta.changes)
    throw new AppError('REPORT_CHANGED', '数据已更新或存档已满，请刷新后重试。', 409)
}
