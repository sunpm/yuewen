import { api } from '@client/api'
import { feedbackEmail, feedbackMailto } from '@client/feedback'
import { zodResolver } from '@hookform/resolvers/zod'
import { type FeedbackContext, type FeedbackEnvironment, feedbackFields } from '@shared/feedback'
import { Copy, Mail, X } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { errorCode, message, online, useAction } from '@/lib/business'
import { feedbackLocation } from '@/lib/feedback'

export default function FeedbackDialog({ close }: { close: () => void }) {
  const location = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  const capture = useRef<AbortController | null>(null)
  const draft = useRef<{
    environment: FeedbackEnvironment
    headers: Record<string, string>
  } | null>(null)
  const pending = useRef<FormData | null>(null)
  const [context, setContext] = useState<FeedbackContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [screenshot, setScreenshot] = useState<Blob | null>(null)
  const [preview, setPreview] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [captureMessage, setCaptureMessage] = useState('')
  const [receipt, setReceipt] = useState('')
  const [notice, setNotice] = useState('')
  const action = useAction()
  const form = useForm({
    resolver: zodResolver(feedbackFields),
    defaultValues: { description: '', steps: '', contact: '' },
  })

  useEffect(() => {
    if (!screenshot) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(screenshot)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [screenshot])
  const start = useEffectEvent(() => {
    void open()
  })
  useEffect(() => {
    start()
    return () => {
      controller.current?.abort()
      capture.current?.abort()
      controller.current = null
      capture.current = null
      pending.current = null
      draft.current = null
    }
  }, [])

  function clear() {
    controller.current?.abort()
    capture.current?.abort()
    controller.current = null
    capture.current = null
    draft.current = null
    pending.current = null
    setScreenshot(null)
    setContext(null)
    setReceipt('')
    setError(null)
    setNotice('')
    form.reset()
  }
  async function screenshotPage(visible = false, opening = false) {
    capture.current?.abort()
    const run = new AbortController()
    capture.current = run
    pending.current = null
    setScreenshot(null)
    setCapturing(true)
    setCaptureMessage('正在生成截图…')
    try {
      const { capturePage } = await import('@/lib/screenshot')
      if (run.signal.aborted) return
      const imagePromise = capturePage(visible, run.signal)
      if (opening) {
        dialog.current?.showModal()
        void establish()
      }
      const image = await imagePromise
      if (run.signal.aborted) return
      setScreenshot(image)
      setCaptureMessage(visible ? '已截取当前可见区域。' : '已截取当前已渲染的整页内容。')
    } catch (failure) {
      if (!run.signal.aborted) setCaptureMessage(`未能生成截图。${message(failure)}`)
    } finally {
      if (!run.signal.aborted) {
        setCapturing(false)
        if (opening && !dialog.current?.open) {
          dialog.current?.showModal()
          void establish()
        }
      }
    }
  }
  async function establish(allowUnverified = false) {
    const run = controller.current
    if (!run || !draft.current) return
    setContextLoading(true)
    setError(null)
    try {
      online()
      const value = await api<FeedbackContext>('/feedback/context', {
        method: 'POST',
        body: JSON.stringify({ allowUnverified }),
        headers: draft.current.headers,
        signal: run.signal,
      })
      if (run.signal.aborted || !draft.current) return
      if (allowUnverified && value.identity === 'visitor') draft.current.environment.source = 'none'
      setContext(value)
      pending.current = null
      if (!value.screenshotAvailable) {
        capture.current?.abort()
        setCapturing(false)
        setScreenshot(null)
        setCaptureMessage('图片服务暂不可用，本次仅发送文字与页面环境。')
      }
    } catch (failure) {
      if (!run.signal.aborted) {
        setError(failure)
        setContext(null)
        if (['FEEDBACK_UNAVAILABLE', 'PREVIEW_ONLY'].includes(errorCode(failure))) {
          capture.current?.abort()
          setCapturing(false)
          setScreenshot(null)
          setCaptureMessage('')
        }
      }
    } finally {
      if (!run.signal.aborted) setContextLoading(false)
    }
  }
  async function open() {
    if (controller.current) return
    clear()
    controller.current = new AbortController()
    const environment = feedbackLocation(location.pathname, location.search)
    draft.current = {
      environment,
      headers:
        environment.source === 'account' || environment.source === 'guest'
          ? { 'X-Yuewen-Connection': environment.source }
          : {},
    }
    // Start snapshot preparation before opening the modal; the clone always excludes dialogs.
    void screenshotPage(false, true)
  }
  const submit = form.handleSubmit(async (values) => {
    if (!context || !draft.current || !controller.current || action.isPending || capturing) return
    const run = controller.current
    const currentDraft = draft.current
    setError(null)
    try {
      await action.run(async () => {
        if (!pending.current) {
          const body = new FormData()
          body.set('contextId', context.contextId)
          body.set('requestId', crypto.randomUUID())
          body.set('payload', JSON.stringify({ ...values, environment: currentDraft.environment }))
          if (screenshot) body.set('screenshot', screenshot, 'screenshot.jpg')
          pending.current = body
        }
        const result = await api<{ id: string }>('/feedback', {
          method: 'POST',
          body: pending.current,
          headers: currentDraft.headers,
          signal: run.signal,
        })
        if (!run.signal.aborted) {
          setReceipt(result.id)
          setScreenshot(null)
          pending.current = null
          form.reset()
        }
      })
    } catch (failure) {
      if (!run.signal.aborted) setError(failure)
    }
  })
  const changed = [
    'FEEDBACK_IDENTITY_CHANGED',
    'FEEDBACK_CONTEXT_REQUIRED',
    'FEEDBACK_CONTEXT_CHANGED',
    'FEEDBACK_GONE',
  ].includes(errorCode(error))
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(feedbackEmail)
      if (dialog.current?.open) setNotice('邮箱已复制。')
    } catch {
      if (dialog.current?.open) setNotice('暂时无法自动复制，请选中邮箱手动复制。')
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
      {receipt ? (
        <p role="status">反馈已保存，编号：{receipt}</p>
      ) : (
        <form
          onSubmit={submit}
          onChange={() => {
            pending.current = null
          }}
          className="feedback-form"
        >
          <fieldset disabled={action.isPending}>
            <label htmlFor="feedback-description">问题描述</label>
            <textarea
              id="feedback-description"
              rows={4}
              maxLength={4000}
              required
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p role="alert">请填写问题描述，最多 4,000 字。</p>
            )}
            <label htmlFor="feedback-steps">复现步骤（可选）</label>
            <textarea id="feedback-steps" rows={2} maxLength={4000} {...form.register('steps')} />
            <label htmlFor="feedback-contact">联系方式（可选）</label>
            <input id="feedback-contact" maxLength={200} {...form.register('contact')} />
            <p className="scope-note">
              提交时会发送以上文字、页面环境和下方截图。截图可能含书名与私人笔记，请先检查，也可移除。表单输入已隐藏。
            </p>
            {preview && (
              <img
                className="feedback-preview"
                src={preview}
                alt="待提交的网页截图，请检查是否包含私人内容"
              />
            )}
            <p role="status">{captureMessage}</p>
            {context?.screenshotAvailable && (
              <div className="connection-actions">
                <Button
                  variant="outline"
                  disabled={capturing}
                  onClick={() => void screenshotPage()}
                >
                  重新截图
                </Button>
                <Button
                  variant="outline"
                  disabled={capturing}
                  onClick={() => void screenshotPage(true)}
                >
                  仅截可见区域
                </Button>
                {(screenshot || capturing) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      capture.current?.abort()
                      setCapturing(false)
                      setScreenshot(null)
                      pending.current = null
                      setCaptureMessage('已移除截图，仅发送文字与页面环境。')
                    }}
                  >
                    移除截图
                  </Button>
                )}
              </div>
            )}
            {context && (
              <p className="scope-note">
                提交身份：
                {context.identity === 'account'
                  ? '登录账号'
                  : context.identity === 'guest'
                    ? '当前游客'
                    : '未验证访客'}
                。草稿只保留在本页，关闭后清除。
              </p>
            )}
            {contextLoading && <p role="status">正在确认反馈服务…</p>}
            {error != null && <p role="alert">{message(error)}</p>}
            {errorCode(error) === 'CONNECTION_REQUIRED' && (
              <div className="connection-actions">
                {(['guest', 'account'] as const).map((connection) => (
                  <Button
                    key={connection}
                    variant="outline"
                    disabled={contextLoading}
                    onClick={() => {
                      if (!draft.current) return
                      draft.current.headers = { 'X-Yuewen-Connection': connection }
                      if (draft.current.environment.source !== 'mock')
                        draft.current.environment.source = connection
                      void establish()
                    }}
                  >
                    {connection === 'guest' ? '使用游客身份' : '使用账号身份'}
                  </Button>
                ))}
              </div>
            )}
            {changed ? (
              <Button
                variant="outline"
                disabled={contextLoading}
                onClick={() => {
                  pending.current = null
                  setContext(null)
                  void establish(true)
                }}
              >
                重新确认身份与内容
              </Button>
            ) : (
              !context &&
              !contextLoading && (
                <Button variant="outline" onClick={() => void establish()}>
                  重试连接
                </Button>
              )
            )}
            <Button type="submit" disabled={!context || contextLoading || capturing || changed}>
              {action.isPending ? '正在提交…' : '提交反馈'}
            </Button>
          </fieldset>
        </form>
      )}
      <details className="feedback-mail">
        <summary>也可通过邮件联系</summary>
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
          {notice}
        </p>
      </details>
    </dialog>
  )
}
