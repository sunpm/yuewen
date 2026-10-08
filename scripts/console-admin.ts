import { provisionConsoleAdmin } from '../server/console/admin'

const mode = process.argv[2]
if (mode !== 'init' && mode !== 'reset') {
  console.error('请使用 console:admin:init 或 console:admin:reset。')
  process.exit(1)
}
try {
  const result = await provisionConsoleAdmin(mode, {
    username: process.env.CONSOLE_ADMIN_USERNAME ?? '',
    password: process.env.CONSOLE_ADMIN_PASSWORD ?? '',
  })
  console.log(
    {
      created: '管理员已创建。',
      exists: '管理员已存在，密码保持不变。',
      reset: '密码已重置，旧管理会话已撤销。',
    }[result],
  )
  process.exit(0)
} catch {
  console.error('操作失败。请检查迁移、后台配置及管理员账号；未输出凭据或数据库错误详情。')
  process.exit(1)
}
