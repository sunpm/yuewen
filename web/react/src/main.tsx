import '@client/fonts.css'
import '@/styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from '@/app'
import { ErrorBoundary } from '@/components/error-boundary'
import { queries } from '@/lib/business'

const root = document.getElementById('app')
if (!root) throw new Error('Missing app root')
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queries}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
