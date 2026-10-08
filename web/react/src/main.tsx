import '@client/fonts.css'
import '@/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from '@/app'
import { ErrorBoundary } from '@/components/error-boundary'

const root = document.getElementById('app')
if (!root) throw new Error('Missing app root')
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
