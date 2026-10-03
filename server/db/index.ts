import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'
let database: ReturnType<typeof drizzle<typeof schema>> | undefined
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  database ??= drizzle(
    postgres(process.env.DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    }),
    { schema },
  )
  return database
}
