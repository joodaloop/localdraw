import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import path from 'node:path'
import type { ThumbnailImages, ThumbnailJob, ThumbnailRenderRequest, ThumbnailRenderResult } from '../shared/api'
import type { BackendProcess } from './backend-process'
import { logError } from './log'

/** Waits this long after a trigger, so a closed board's last edits and camera reach the database. */
const START_DELAY_MS = 500
/** Rendering one board shouldn't take anywhere near this; past it the window is assumed stuck. */
const RENDER_TIMEOUT_MS = 15_000

interface ThumbnailRendererOptions {
	backend: BackendProcess
	/** The URL of the thumbnail page (thumbnail.html) in the dev server or the built app. */
	pageUrl: string
	/** The main window's canvas size, so previews show what the saved camera showed. */
	getViewport(): { w: number; h: number }
	/** Called after each preview is saved, so Home can show it. */
	onUpdated(): void
}

/**
 * Renders board previews in a hidden window, one board at a time. `refresh()` renders
 * every board whose preview is missing or older than its content or camera; the
 * window opens for that run and closes as soon as it's done.
 */
export class ThumbnailRenderer {
	private running = false
	private runAgain = false
	private startTimer: NodeJS.Timeout | undefined
	private worker: { win: BrowserWindow; ready: Promise<void> } | null = null
	private nextRequestId = 1
	private pending = new Map<number, (result: ThumbnailRenderResult) => void>()

	constructor(private options: ThumbnailRendererOptions) {
		ipcMain.on('thumbnail-result', (event: IpcMainEvent, result: ThumbnailRenderResult) => {
			if (event.sender !== this.worker?.win.webContents) return
			const resolve = this.pending.get(result?.requestId)
			if (!resolve) return
			this.pending.delete(result.requestId)
			resolve(result)
		})
	}

	refresh() {
		if (this.running) {
			this.runAgain = true
			return
		}
		if (this.startTimer) return
		this.startTimer = setTimeout(() => {
			this.startTimer = undefined
			void this.run()
		}, START_DELAY_MS)
	}

	private async run() {
		this.running = true
		try {
			do {
				this.runAgain = false
				const stale = await this.options.backend.call('staleThumbnails')
				for (const boardId of stale) await this.renderBoard(boardId)
			} while (this.runAgain)
		} catch (e) {
			logError('main', `thumbnail refresh failed: ${e instanceof Error ? e.message : String(e)}`)
		} finally {
			this.closeWorker()
			this.running = false
		}
	}

	private async renderBoard(boardId: string) {
		const { backend } = this.options
		const job = await backend.call('getThumbnailJob', boardId)
		if (!job) return

		let images: ThumbnailImages | null = null
		// A board never opened has nothing to draw; no need to open the window for it.
		if (job.document) {
			const result = await this.render(job)
			if (result.ok) images = result.images
			else logError('main', `thumbnail for board ${boardId} failed: ${result.error}`)
		}
		await backend.call('putThumbnail', boardId, job.sourceVersion, images)
		if (images) this.options.onUpdated()
	}

	private async render(job: ThumbnailJob): Promise<ThumbnailRenderResult> {
		const requestId = this.nextRequestId++
		const worker = this.openWorker()
		try {
			await worker.ready
		} catch (e) {
			this.closeWorker()
			return { requestId, ok: false, error: e instanceof Error ? e.message : String(e) }
		}

		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId)
				// Whatever it's stuck on would hold up every board after this one.
				this.closeWorker()
				resolve({ requestId, ok: false, error: 'timed out' })
			}, RENDER_TIMEOUT_MS)
			this.pending.set(requestId, (result) => {
				clearTimeout(timer)
				resolve(result)
			})
			const request: ThumbnailRenderRequest = { requestId, job, viewport: this.options.getViewport() }
			worker.win.webContents.send('thumbnail-render', request)
		})
	}

	private openWorker() {
		if (this.worker && !this.worker.win.isDestroyed()) return this.worker

		const win = new BrowserWindow({
			show: false,
			webPreferences: {
				preload: path.join(__dirname, '../preload/thumbnail-preload.cjs'),
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				spellcheck: false,
				// Hidden windows are throttled by default, which would stall the export's rendering.
				backgroundThrottling: false,
			},
		})
		win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
		win.webContents.on('will-navigate', (event) => event.preventDefault())

		const ready = new Promise<void>((resolve, reject) => {
			const onReady = (event: IpcMainEvent) => {
				if (event.sender !== win.webContents) return
				ipcMain.off('thumbnail-worker-ready', onReady)
				resolve()
			}
			ipcMain.on('thumbnail-worker-ready', onReady)
			win.on('closed', () => {
				ipcMain.off('thumbnail-worker-ready', onReady)
				reject(new Error('thumbnail window closed'))
			})
		})
		// Rejections are handled by whoever awaits `ready`; don't report them as unhandled.
		ready.catch(() => {})

		win.webContents.on('render-process-gone', (_event, { reason }) => {
			logError('main', `thumbnail window gone: ${reason}`)
			this.failPending(`thumbnail window gone: ${reason}`)
			this.closeWorker()
		})
		void win.loadURL(this.options.pageUrl)

		this.worker = { win, ready }
		return this.worker
	}

	private closeWorker() {
		const worker = this.worker
		this.worker = null
		if (worker && !worker.win.isDestroyed()) worker.win.destroy()
		this.failPending('thumbnail window closed')
	}

	private failPending(error: string) {
		for (const [requestId, resolve] of this.pending) resolve({ requestId, ok: false, error })
		this.pending.clear()
	}
}
