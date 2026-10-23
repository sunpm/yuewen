import type { ReportTask } from './connection'
import type { ReadingReport } from './report'

export const ARCHIVE_LIMIT = 20
export const ARCHIVE_MAX_BYTES = 2 * 1024 * 1024

export interface ArchiveSummary {
  id: string
  createdAt: string
  generatedAt: string
  range: ReadingReport['range']
  summary: ReadingReport['summary']
  coverage: ReadingReport['coverage']
  sourceStatus: ReportTask['status']
  includeNotes: boolean
  bytes: number
}

export interface ArchivedReport extends ArchiveSummary {
  report: ReadingReport
}
