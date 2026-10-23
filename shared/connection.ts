import type { RangeKey, ReadingReport } from './report'

export type Connection = 'guest' | 'account'
export interface Connections {
  serverTime: string
  guest: { status: string; context: string; expiresAt: string; idleExpiresAt: string } | null
  account: { status: string; context: string; expiresAt: string } | null
}
export interface ReportTask {
  id: string
  version: number
  status: 'queued' | 'running' | 'completed' | 'partial' | 'cancelled' | 'failed'
  stage: string
  report: ReadingReport
  keyVersion: number
  noteTotal: number
  notesComplete: boolean
  retryAllowed?: boolean
  continueAllowed?: boolean
  segment?: number
  segmentLimit?: number
  requests?: number
  segmentRequests?: number
  issueCode?: string
  expiresAt: string
  idleExpiresAt: string
  serverTime: string
}
export interface SaveResult {
  reportId: string
  range: RangeKey
}
