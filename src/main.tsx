import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GptWindow } from './components/gpt/GptWindow'
import { isGptWindow } from './features/gpt/chatWindow'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isGptWindow() ? <GptWindow /> : <App />}
  </StrictMode>,
)
