import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'tldraw/tldraw.css'
import { App } from './App'
import './styles.css'

// Uncaught errors go to the app's log file too, since the packaged app has no console to read.
window.addEventListener('error', (event) => {
	window.localdraw.logError(`uncaught error: ${event.error instanceof Error ? (event.error.stack ?? event.error.message) : event.message}`)
})
window.addEventListener('unhandledrejection', (event) => {
	const reason = event.reason instanceof Error ? (event.reason.stack ?? event.reason.message) : String(event.reason)
	window.localdraw.logError(`unhandled rejection: ${reason}`)
})

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
)
