import { contextBridge, ipcRenderer } from 'electron'
import type { LocaldrawApi } from '../shared/api'

const api: LocaldrawApi = {
	listBoards: () => ipcRenderer.invoke('backend', 'listBoards'),
	createBoard: () => ipcRenderer.invoke('backend', 'createBoard'),
	renameBoard: (boardId, title) => ipcRenderer.invoke('backend', 'renameBoard', boardId, title),
	putAsset: (upload) => ipcRenderer.invoke('backend', 'putAsset', upload),
	getSession: (boardId) => ipcRenderer.invoke('backend', 'getSession', boardId),
	saveSession: (boardId, state) => ipcRenderer.invoke('backend', 'saveSession', boardId, state),
	getLastBoardId: () => ipcRenderer.invoke('backend', 'getLastBoardId'),
	unfurl: (url) => ipcRenderer.invoke('unfurl', url),
	getMemoryUsage: () => ipcRenderer.invoke('memory-usage'),

	onGoHome(callback) {
		const listener = () => callback()
		ipcRenderer.on('go-home', listener)
		return () => void ipcRenderer.off('go-home', listener)
	},

	// MessagePorts can't cross the context bridge, so the preload keeps the port
	// and exposes plain send/close functions to the page instead.
	connectBoard(boardId, sessionId, handlers) {
		const { port1, port2 } = new MessageChannel()
		ipcRenderer.postMessage('connect-board', { boardId, sessionId }, [port2])
		port1.onmessage = (event) => handlers.onMessage(event.data)
		port1.addEventListener('close', () => handlers.onClose())
		port1.start()
		return {
			send: (data) => port1.postMessage(data),
			close: () => port1.close(),
		}
	},
}

contextBridge.exposeInMainWorld('localdraw', api)

// Lets CSS adapt to platform chrome, e.g. the macOS traffic lights. The
// document doesn't exist yet when the preload runs.
window.addEventListener('DOMContentLoaded', () => {
	document.documentElement.dataset.platform = process.platform
})

ipcRenderer.on('full-screen', (_event, isFullScreen: boolean) => {
	document.documentElement.toggleAttribute('data-full-screen', isFullScreen)
})
