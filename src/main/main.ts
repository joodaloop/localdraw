import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeTheme,
	net,
	protocol,
	shell,
	type IpcMainEvent,
	type IpcMainInvokeEvent,
} from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { RENDERER_METHODS, type RendererMethod } from '../shared/api'
import { assetFilePath, isAssetHash } from '../shared/asset-files'
import { BackendProcess } from './backend-process'
import { unfurl } from './unfurl'

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIR = path.join(__dirname, '../renderer')
const APP_ORIGIN = DEV_SERVER_URL ? originOf(DEV_SERVER_URL) : 'localdraw://app'

// Development gets its own data folder (…/Application Support/localdraw-dev), so
// work-in-progress code never touches the boards in your real one. This must run
// before anything reads userData, including the single-instance lock below, which
// is per data folder: dev and the built app can therefore run side by side.
if (DEV_SERVER_URL) app.setPath('userData', path.join(app.getPath('appData'), 'localdraw-dev'))

// Two app instances would each run their own sync rooms against the same
// database and silently diverge, so only ever run one.
if (!app.requestSingleInstanceLock()) app.quit()

// `localdraw://app/…` serves the built renderer, `localdraw://asset/<sha256>` serves
// stored files. A privileged standard scheme (not file://) gives the page a real
// origin, fetch() support, and V8 code caching.
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'localdraw',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
	},
])

// Set the menu before `ready` so Electron never builds its default one. macOS
// needs Cut/Copy/Paste menu items for those shortcuts to reach the page;
// everything else (undo, zoom, select all) is left to tldraw's own shortcuts.
Menu.setApplicationMenu(
	process.platform === 'darwin'
		? Menu.buildFromTemplate([
				{ role: 'appMenu' },
				{ label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }] },
				{
					label: 'View',
					submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
				},
				{ role: 'windowMenu' },
			])
		: null
)

const ASSETS_DIR = path.join(app.getPath('userData'), 'assets')
const backend = new BackendProcess(path.join(app.getPath('userData'), 'localdraw.db'), ASSETS_DIR)

function originOf(url: string) {
	// WHATWG URL reports origin "null" for custom schemes, so build it by hand.
	const { protocol, host } = new URL(url)
	return `${protocol}//${host}`
}

function isAppUrl(url: string) {
	try {
		return originOf(url) === APP_ORIGIN
	} catch {
		return false
	}
}

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent) {
	const url = event.senderFrame?.url
	return url !== undefined && isAppUrl(url)
}

async function serveAppFile(pathname: string) {
	const file = path.join(RENDERER_DIR, decodeURIComponent(pathname === '/' ? '/index.html' : pathname))
	const relative = path.relative(RENDERER_DIR, file)
	if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 })
	// net.fetch rejects on a missing file; answer with a 404 like a normal server would.
	const exists = await stat(file).then((s) => s.isFile(), () => false)
	if (!exists) return new Response('Not found', { status: 404 })
	return net.fetch(pathToFileURL(file).toString())
}

/**
 * Parses a single-range `Range: bytes=…` header. Returns null to serve the whole
 * file (no header, or a multi-range request), or 'invalid' for an unsatisfiable range.
 */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
	const match = header?.match(/^bytes=(\d*)-(\d*)$/)
	if (!match) return null
	const [, first, last] = match
	let start: number
	let end: number
	if (first === '') {
		// Suffix range: the last N bytes.
		if (last === '') return 'invalid'
		start = Math.max(0, size - Number(last))
		end = size - 1
	} else {
		start = Number(first)
		end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
	}
	return start <= end && start < size ? { start, end } : 'invalid'
}

async function serveAsset(hash: string, request: Request) {
	if (!isAssetHash(hash)) return new Response('Not found', { status: 404 })
	const info = await backend.call('getAssetInfo', hash)
	const file = assetFilePath(ASSETS_DIR, hash)
	const size = info && (await stat(file).then((s) => s.size, () => null))
	if (!info || size == null) return new Response('Not found', { status: 404 })

	const headers: Record<string, string> = {
		'content-type': info.mime || 'application/octet-stream',
		// Assets are content-addressed, so a URL's bytes never change.
		'cache-control': 'public, max-age=31536000, immutable',
		'access-control-allow-origin': '*',
		// Lets audio and video seek without downloading the whole file.
		'accept-ranges': 'bytes',
	}

	const range = parseRange(request.headers.get('range'), size)
	if (range === 'invalid') {
		return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } })
	}
	const { start, end } = range ?? { start: 0, end: size - 1 }
	const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream)
	return new Response(body, {
		status: range ? 206 : 200,
		headers: {
			...headers,
			'content-length': String(size === 0 ? 0 : end - start + 1),
			...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
		},
	})
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 480,
		minHeight: 360,
		// Keep macOS traffic lights while hiding the native title-bar content.
		frame: process.platform === 'darwin',
		titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
		// Vertically centre the traffic lights in the 40px toolbar (--toolbar-height in styles.css).
		trafficLightPosition: { x: 14, y: 13 },
		show: false,
		backgroundColor: nativeTheme.shouldUseDarkColors ? '#101011' : '#f9fafb',
		webPreferences: {
			preload: path.join(__dirname, '../preload/preload.cjs'),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			spellcheck: false,
		},
	})
	win.once('ready-to-show', () => win.show())

	// The app never opens its own windows or navigates away; external links go to the browser.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) void shell.openExternal(url)
		return { action: 'deny' }
	})
	win.webContents.on('will-navigate', (event, url) => {
		if (!isAppUrl(url)) event.preventDefault()
	})

	void win.loadURL(DEV_SERVER_URL ?? `${APP_ORIGIN}/index.html`)
}

ipcMain.handle('backend', (event, method: unknown, ...args: unknown[]) => {
	if (!isTrustedSender(event)) throw new Error('Untrusted sender')
	if (!RENDERER_METHODS.includes(method as RendererMethod)) throw new Error(`Unknown method: ${String(method)}`)
	const call = backend.call.bind(backend) as (method: string, ...args: unknown[]) => Promise<unknown>
	return call(method as string, ...args)
})

// Link previews are fetched here rather than in the page: the main process isn't
// subject to CORS or the page's CSP.
ipcMain.handle('unfurl', (event, url: unknown) => {
	if (!isTrustedSender(event)) throw new Error('Untrusted sender')
	if (typeof url !== 'string') throw new Error('Expected a URL')
	return unfurl(url)
})

// The renderer hands us one end of a MessageChannel per open board; we pass it
// straight to the backend so sync traffic flows renderer <-> backend directly.
ipcMain.on('connect-board', (event, msg: { boardId?: unknown; sessionId?: unknown } | undefined) => {
	const port = event.ports[0]
	if (!port) return
	if (!isTrustedSender(event) || typeof msg?.boardId !== 'string' || typeof msg.sessionId !== 'string') {
		port.close()
		return
	}
	backend.connectBoard(msg.boardId, msg.sessionId, port)
})

app.on('second-instance', () => {
	const [win] = BrowserWindow.getAllWindows()
	if (!win) return createWindow()
	if (win.isMinimized()) win.restore()
	win.focus()
})

app.whenReady().then(() => {
	backend.start()

	protocol.handle('localdraw', (request) => {
		const url = new URL(request.url)
		if (url.host === 'asset') return serveAsset(url.pathname.slice(1), request)
		if (url.host === 'app' && !DEV_SERVER_URL) return serveAppFile(url.pathname)
		return new Response('Not found', { status: 404 })
	})

	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => backend.stop())
