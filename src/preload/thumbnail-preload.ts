import { contextBridge, ipcRenderer } from 'electron'
import type { ThumbnailWorkerApi } from '../shared/api'

// The hidden thumbnail window's only link to the main process: it receives boards to
// render and sends back images. It gets none of the app window's API.
const api: ThumbnailWorkerApi = {
	onRender(callback) {
		ipcRenderer.on('thumbnail-render', (_event, request) => callback(request))
		ipcRenderer.send('thumbnail-worker-ready')
	},
	sendResult: (result) => ipcRenderer.send('thumbnail-result', result),
}

contextBridge.exposeInMainWorld('thumbnailWorker', api)
