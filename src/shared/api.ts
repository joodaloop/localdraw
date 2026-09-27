// Types shared by every process. Keep this file free of runtime imports so it
// can be pulled into main, preload, backend and renderer bundles alike.

export interface BoardSummary {
	id: string
	title: string
	createdAt: number
	updatedAt: number
	/** Changes whenever the board's preview image does; null while it has none. */
	thumbnailVersion: number | null
}

export interface AssetUpload {
	name: string
	mime: string
	data: Uint8Array
}

export interface AssetInfo {
	mime: string
	size: number
}

export interface TextSearchResult {
	boardId: string
	shapeId: import('@tldraw/tlschema').TLShapeId
	boardTitle: string
	/** The full text of the matching shape, not just the matched fragment. */
	text: string
}

/** Everything needed to render one board's preview, read from the database. */
export interface ThumbnailJob {
	boardId: string
	/** The newer of the board's and its session's `updated_at`; saved with the result. */
	sourceVersion: number
	/** The board's document as a tldraw store snapshot; null for a board never opened. */
	document: { store: Record<string, unknown>; schema: unknown } | null
	/** The board's saved view state (page, camera), if any. */
	session: unknown
}

export type ThumbnailTheme = 'light' | 'dark'

/** A board's preview in both color modes, so Home can follow the system's without re-rendering. */
export interface ThumbnailImages {
	light: Uint8Array
	dark: Uint8Array
	mime: string
}

/** What the thumbnail window is asked to render. */
export interface ThumbnailRenderRequest {
	requestId: number
	job: ThumbnailJob
	/** The main window's canvas size in CSS pixels, to turn the saved camera into a page-space box. */
	viewport: { w: number; h: number }
}

export type ThumbnailRenderResult =
	| { requestId: number; ok: true; images: ThumbnailImages | null }
	| { requestId: number; ok: false; error: string }

/** The API the thumbnail window's preload exposes on `window.thumbnailWorker`. */
export interface ThumbnailWorkerApi {
	onRender(callback: (request: ThumbnailRenderRequest) => void): void
	sendResult(result: ThumbnailRenderResult): void
}

/** Request/response methods implemented by the backend utility process. */
export interface BackendMethods {
	listBoards(): BoardSummary[]
	createBoard(title?: string): BoardSummary
	renameBoard(boardId: string, title: string): void
	putAsset(upload: AssetUpload): Promise<{ hash: string }>
	getAssetInfo(hash: string): AssetInfo | null
	/** The board's tldraw session snapshot (validated and migrated by tldraw on load). */
	getSession(boardId: string): unknown
	saveSession(boardId: string, state: unknown): void
	/** The board viewed most recently, to reopen on launch. */
	getLastBoardId(): string | null
	/** Full-text search over every board's shape labels, newest-indexed match ranking first. */
	searchText(query: string): TextSearchResult[]
	/** Boards whose preview is missing or older than their content or camera, most recently edited first. */
	staleThumbnails(): string[]
	getThumbnailJob(boardId: string): ThumbnailJob | null
	/** Null images record that there's nothing to show (empty board, or rendering failed) for this version. */
	putThumbnail(boardId: string, sourceVersion: number, images: ThumbnailImages | null): void
	getThumbnail(boardId: string, theme: ThumbnailTheme): { image: Uint8Array; mime: string } | null
}

export type BackendMethod = keyof BackendMethods

/** The subset of backend methods the renderer may call through IPC. */
export const RENDERER_METHODS = [
	'listBoards',
	'createBoard',
	'renameBoard',
	'putAsset',
	'getSession',
	'saveSession',
	'getLastBoardId',
	'searchText',
] as const satisfies readonly BackendMethod[]
export type RendererMethod = (typeof RENDERER_METHODS)[number]

// main -> backend
export type BackendRequest =
	| { kind: 'call'; id: number; method: BackendMethod; args: unknown[] }
	| { kind: 'connect'; boardId: string; sessionId: string } // carries a MessagePort

// backend -> main
export type BackendResponse =
	| { kind: 'result'; id: number; ok: true; value: unknown }
	| { kind: 'result'; id: number; ok: false; error: string }

export interface BoardConnection {
	send(data: string): void
	close(): void
}

export interface BoardConnectionHandlers {
	onMessage(data: string): void
	onClose(): void
}

/** The API the preload script exposes on `window.localdraw`. */
export interface LocaldrawApi {
	listBoards(): Promise<BoardSummary[]>
	createBoard(title?: string): Promise<BoardSummary>
	renameBoard(boardId: string, title: string): Promise<void>
	putAsset(upload: AssetUpload): Promise<{ hash: string }>
	getSession(boardId: string): Promise<unknown>
	saveSession(boardId: string, state: unknown): Promise<void>
	getLastBoardId(): Promise<string | null>
	searchText(query: string): Promise<TextSearchResult[]>
	/** Asks the main process to re-render any out-of-date board previews. */
	refreshThumbnails(): void
	/** Subscribes to board preview updates. Returns an unsubscribe function. */
	onThumbnailsUpdated(callback: () => void): () => void
	getMemoryUsage(): Promise<MemoryUsage>
	/** Fetches a web page's title, description and preview images, for bookmark cards. */
	unfurl(url: string): Promise<LinkPreview>
	connectBoard(boardId: string, sessionId: string, handlers: BoardConnectionHandlers): BoardConnection
	/** Appends a line to the app's error log file. */
	logError(message: string): void
	/** Subscribes to the File → Go Home menu command. Returns an unsubscribe function. */
	onGoHome(callback: () => void): () => void
	/** Subscribes to the File → Open Board… menu command. Returns an unsubscribe function. */
	onOpenBoardMenu(callback: () => void): () => void
	/** Subscribes to the View → Next/Previous Tab menu commands (Ctrl+Tab / Ctrl+Shift+Tab). */
	onNextTab(callback: () => void): () => void
	onPrevTab(callback: () => void): () => void
	/** Subscribes to the File → Close Tab menu command (Cmd/Ctrl+W). */
	onCloseTab(callback: () => void): () => void
	/** Subscribes to the File → Reopen Closed Tab menu command (Cmd/Ctrl+Shift+T). */
	onReopenTab(callback: () => void): () => void
	/** Subscribes to the View → Tab 1–9 menu commands (Cmd/Ctrl+1–9); 9 always means the last tab. */
	onGotoTab(callback: (position: number) => void): () => void
}

/** Resident memory ("Real Memory" in Activity Monitor) across all of the app's processes. */
export interface MemoryUsage {
	totalBytes: number
	processes: { name: string; bytes: number }[]
}

export interface LinkPreview {
	title: string
	description: string
	image: string
	favicon: string
}

/**
 * Stored in asset records' `src`. tldraw only accepts http(s), data: and asset:
 * sources, so records use `asset:<sha256>`; the asset store resolves it to
 * `localdraw://asset/<sha256>`, which the main process serves from disk.
 */
export const ASSET_SRC_PREFIX = 'asset:'
export const ASSET_URL_PREFIX = 'localdraw://asset/'
/** Board previews are served at `localdraw://thumbnail/<boardId>/<light|dark>?v=<thumbnailVersion>`. */
export const THUMBNAIL_URL_PREFIX = 'localdraw://thumbnail/'

const BOARD_ID_RE = /^[0-9a-f]{32}$/
export function isBoardId(value: unknown): value is string {
	return typeof value === 'string' && BOARD_ID_RE.test(value)
}
