import { z } from 'zod'

export const managementReasons = {
  user_request: '用户申请',
  security: '账号或连接安全',
  troubleshooting: '排查与恢复',
  maintenance: '数据维护',
} as const
export const managementReason = z.enum(
  Object.keys(managementReasons) as [
    keyof typeof managementReasons,
    ...Array<keyof typeof managementReasons>,
  ],
)
export const renameUserInput = z
  .object({
    name: z.string().trim().min(1, '请输入昵称。').max(100, '昵称最多 100 字。'),
    updatedAt: z.iso.datetime(),
  })
  .strict()
export const managementConfirmation = z
  .object({
    password: z.string().min(1, '请输入管理员密码。').max(128, '密码最多 128 位。'),
    reason: managementReason,
  })
  .strict()
export const timestampActionInput = managementConfirmation.extend({ updatedAt: z.iso.datetime() })
export const versionActionInput = timestampActionInput.extend({ version: z.number().int().min(0) })
export type ManagementReason = z.infer<typeof managementReason>
