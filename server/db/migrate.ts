import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { getDb } from './index'
await migrate(getDb(), { migrationsFolder: 'server/db/migrations' })
console.log('数据库迁移完成。')
process.exit(0)
