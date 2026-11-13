import { Camera, Download, ExternalLink, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { message } from '@/lib/business'
import { feedbackIssueUrl } from '@/lib/feedback'

export default function FeedbackDialog({ close }: { close: () => void }) {
  const location = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const capture = useRef<AbortController | null>(null)
  const [issueUrl] = useState(() => feedbackIssueUrl(location.pathname, location.search))
  const [screenshot, setScreenshot] = useState<Blob | null>(null)
  const [preview, setPreview] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
    return () => capture.current?.abort()
  }, [])
  useEffect(() => {
    if (!screenshot) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(screenshot)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])

  async function screenshotPage() {
    capture.current?.abort()
    const run = new AbortController()
    capture.current = run
    setScreenshot(null)
    setError('')
    setCapturing(true)
    try {
      const { capturePage } = await import('@/lib/screenshot')
      if (run.signal.aborted) return
      const image = await capturePage(true, run.signal)
      if (!run.signal.aborted) setScreenshot(image)
    } catch (failure) {
      if (!run.signal.aborted) setError(message(failure))
    } finally {
      if (!run.signal.aborted) setCapturing(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby="feedback-title"
      onClose={close}
    >
      <div className="panel-heading">
        <h2 id="feedback-title">意见反馈</h2>
        <Button
          variant="ghost"
          className="size-11 p-0"
          aria-label="关闭反馈"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </div>
      <p className="scope-note">将在 GitHub 公开提交，自动附带页面和浏览器信息。</p>
      <div className="connection-actions">
        <Button asChild>
          <a href={issueUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            前往 GitHub
          </a>
        </Button>
        <Button variant="outline" disabled={capturing} onClick={() => void screenshotPage()}>
          <Camera size={16} aria-hidden="true" />
          {capturing ? '正在截图…' : preview ? '重新截图' : '截取可见区域'}
        </Button>
      </div>
      {preview && (
        <div className="feedback-attachment">
          <img className="feedback-preview" src={preview} alt="当前页面截图" />
          <p className="scope-note">截图可能含书名和私人笔记。检查后下载，拖入 Issue 描述框。</p>
          <div className="connection-actions">
            <Button variant="outline" asChild>
              <a href={preview} download="yuewen-feedback.jpg">
                <Download size={16} aria-hidden="true" />
                下载截图
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setScreenshot(null)}>
              移除截图
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </dialog>
  )
}
