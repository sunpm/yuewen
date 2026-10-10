import { feedbackEmail, feedbackMailto } from '@client/feedback'
import { Copy, Mail, MessageSquare, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function Feedback() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(feedbackEmail)
      if (dialog.current?.open) setMessage('邮箱已复制。')
    } catch {
      if (dialog.current?.open) setMessage('暂时无法自动复制，请选中邮箱手动复制。')
    }
  }

  return (
    <>
      <button
        type="button"
        className="nav-link feedback-trigger"
        aria-label="意见反馈"
        title="意见反馈"
        aria-haspopup="dialog"
        onClick={() => {
          setMessage('')
          dialog.current?.showModal()
        }}
      >
        <MessageSquare size={18} aria-hidden="true" />
        <span className="nav-label">意见反馈</span>
      </button>
      <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-title">
        <div className="panel-heading">
          <h2 id="feedback-title">意见反馈</h2>
          <Button
            variant="ghost"
            className="size-11 p-0"
            aria-label="关闭反馈"
            title="关闭反馈"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        <p className="feedback-address">{feedbackEmail}</p>
        <div className="connection-actions">
          <Button asChild>
            <a href={feedbackMailto}>
              <Mail size={16} aria-hidden="true" />
              发送邮件
            </a>
          </Button>
          <Button variant="outline" onClick={() => void copyEmail()}>
            <Copy size={16} aria-hidden="true" />
            复制邮箱
          </Button>
        </div>
        <p role="status" className="scope-note">
          {message}
        </p>
      </dialog>
    </>
  )
}
