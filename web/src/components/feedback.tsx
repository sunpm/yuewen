import { feedbackMailto } from '@client/feedback'
import { MessageSquare } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'

const FeedbackDialog = lazy(() => import('./feedback-dialog'))

export function Feedback() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="nav-link feedback-trigger"
        aria-label="意见反馈"
        title="意见反馈"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MessageSquare size={18} aria-hidden="true" />
        <span className="nav-label">意见反馈</span>
      </button>
      {open && (
        <ErrorBoundary
          fallback={
            <p role="alert">
              反馈暂时无法打开，
              <a className="text-link" href={feedbackMailto}>
                请通过邮件联系
              </a>
              。
            </p>
          }
        >
          <Suspense fallback={<p role="status">正在打开反馈…</p>}>
            <FeedbackDialog close={() => setOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
