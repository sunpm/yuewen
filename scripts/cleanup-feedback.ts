import { cleanupFeedback } from '../server/feedback/lifecycle'

if (process.argv[2] !== '--run') throw new Error('请显式指定 --run 执行当前数据库的反馈清理。')
try {
  console.log(await cleanupFeedback())
  process.exit(0)
} catch {
  console.error('反馈清理未完成，请检查数据库和 R2 配置后重试。')
  process.exit(1)
}
