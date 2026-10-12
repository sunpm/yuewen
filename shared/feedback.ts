import { z } from 'zod'
import { isRangeKey } from './report'

export const feedbackEnvironment = z
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
export const feedbackPayload = z
  .object({
    description: z.string().trim().min(1).max(4000),
    steps: z.string().trim().max(4000).default(''),
    contact: z.string().trim().max(200).default(''),
    environment: feedbackEnvironment,
  })
  .strict()

export const feedbackFields = feedbackPayload.omit({ environment: true })
export type FeedbackEnvironment = z.infer<typeof feedbackEnvironment>
export interface FeedbackContext {
  contextId: string
  expiresAt: string
  identity: 'account' | 'guest' | 'visitor'
  screenshotAvailable: boolean
}
