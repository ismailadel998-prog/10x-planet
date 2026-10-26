import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Teacher from './Teacher'
import './index.css'
import './dashboard.css'

const isTeacher = window.location.pathname.replace(/\/+$/, '') === '/teacher'
if (isTeacher) document.title = 'Teacher Dashboard · 10X Planet'

createRoot(document.getElementById('root')!).render(<StrictMode>{isTeacher ? <Teacher /> : <App />}</StrictMode>)
