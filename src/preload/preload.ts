import { contextBridge, ipcRenderer } from 'electron'
import type { LocaldrawApi } from '../shared/api'

const api: LocaldrawApi = {
	listBoards: () => ipcRenderer.invoke('backend', 'listBoards'),
	createBoard: (title) => ipcRenderer.invoke('backend', 'createBoard', title),
	renameBoard: (boardId, title) => ipcRenderer.invoke('backend', 'renameBoard', boardId, title),
	putAsset: (upload) => ipcRenderer.invoke('backend', 'putAsset', upload),
	getSession: (boardId) => ipcRenderer.invoke('backend', 'getSession', boardId),
	saveSession: (boardId, state) => ipcRenderer.invoke('backend', 'saveSession', boardId, state),
	getLastBoardId: () => ipcRenderer.invoke('backend', 'getLastBoardId'),
	searchText: (query) => ipcRenderer.invoke('backend', 'searchText', query),
	refreshThumbnails: () => ipcRenderer.send('refresh-thumbnails'),
	unfurl: (url) => ipcRenderer.invoke('unfurl', url),
	getMemoryUsage: () => ipcRenderer.invoke('memory-usage'),
	logError: (message) => ipcRenderer.send('log-error', message),

	onGoHome(callback) {
		const listener = () => callback()
		ipcRenderer.on('go-home', listener)
		return () => void ipcRenderer.off('go-home', listener)
	},

	onOpenBoardMenu(callback) {
		const listener = () => callback()
		ipcRenderer.on('open-board-menu', listener)
		return () => void ipcRenderer.off('open-board-menu', listener)
	},

	onNextTab(callback) {
		const listener = () => callback()
		ipcRenderer.on('next-tab', listener)
		return () => void ipcRenderer.off('next-tab', listener)
	},

	onPrevTab(callback) {
		const listener = () => callback()
		ipcRenderer.on('prev-tab', listener)
		return () => void ipcRenderer.off('prev-tab', listener)
	},

	onCloseTab(callback) {
		const listener = () => callback()
		ipcRenderer.on('close-tab', listener)
		return () => void ipcRenderer.off('close-tab', listener)
	},

	onReopenTab(callback) {
		const listener = () => callback()
		ipcRenderer.on('reopen-tab', listener)
		return () => void ipcRenderer.off('reopen-tab', listener)
	},

	onThumbnailsUpdated(callback) {
		const listener = () => callback()
		ipcRenderer.on('thumbnails-updated', listener)
		return () => void ipcRenderer.off('thumbnails-updated', listener)
	},

	onGotoTab(callback) {
		const listener = (_event: unknown, position: number) => callback(position)
		ipcRenderer.on('goto-tab', listener)
		return () => void ipcRenderer.off('goto-tab', listener)
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
