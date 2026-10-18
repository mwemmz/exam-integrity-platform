import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setToken } from './lib/api'

// LTI launch from an LMS (e.g. Moodle): the server redirects here with the session token in the URL fragment.
if (window.location.pathname === '/lti') {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const token = params.get('token')
  const to = params.get('to') || '/'
  if (token) setToken(token)
  window.location.replace(to.startsWith('/') ? to : '/')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
