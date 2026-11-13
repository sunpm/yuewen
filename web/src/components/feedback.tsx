import { lazy, Suspense, useEffect, useState } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import { enterPrivateDocument } from '@/lib/analytics'
import { feedbackIssuesUrl } from '@/lib/feedback'

const FeedbackDialog = lazy(() => import('./feedback-dialog'))

export function Feedback() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const resume = () => setOpen(true)
    window.addEventListener('yuewen:feedback-ready', resume)
    return () => window.removeEventListener('yuewen:feedback-ready', resume)
  }, [])
  return (
    <>
      <button
        type="button"
        className="utility-link"
        aria-haspopup="dialog"
        onClick={() => {
          if (!enterPrivateDocument('feedback')) setOpen(true)
        }}
      >
        意见反馈
      </button>
      {open && (
        <ErrorBoundary
          fallback={
            <p role="alert">
              反馈暂时无法打开，
              <a
                className="text-link"
                href={feedbackIssuesUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                请前往 GitHub Issue
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
