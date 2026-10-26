import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Teacher from './Teacher'
import Host from './live/Host'
import Join from './live/Join'
import './index.css'
import './dashboard.css'
import './live/live.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const routes: Record<string, { el: ReactNode; title?: string }> = {
  '/teacher': { el: <Teacher />, title: 'Teacher Dashboard · 10X Planet' },
  '/host': { el: <Host />, title: 'Live Game · 10X Planet' },
  '/join': { el: <Join />, title: 'Join · 10X Planet' },
}
const route = routes[path]
if (route?.title) document.title = route.title

createRoot(document.getElementById('root')!).render(<StrictMode>{route ? route.el : <App />}</StrictMode>)
