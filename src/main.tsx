import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { registerServiceWorker } from './offline/registerServiceWorker'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Registered after the initial render, not before — the service worker
// installing/updating in the background should never delay first paint.
registerServiceWorker()
