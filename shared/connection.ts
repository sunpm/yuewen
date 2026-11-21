import type { ReadingReport } from './report'
export type Connection = 'instance'
export interface Connections {
  serverTime: string
  instance: { status: string; context: string; expiresAt: string }
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
