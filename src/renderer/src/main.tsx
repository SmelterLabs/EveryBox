import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/themes.css'
import { App } from './App'
import { PopoutThreadWindow } from './components/PopoutThreadWindow'

const popoutThreadId = new URLSearchParams(window.location.search).get('popoutThread')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {popoutThreadId ? <PopoutThreadWindow threadId={popoutThreadId} /> : <App />}
  </React.StrictMode>
)
