import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initializePwaInstall } from './services/pwaInstall'

initializePwaInstall()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <App />,
)
