// Runs in an Electron utility process: owns the SQLite database and every
// tldraw sync room, so no disk or sync work ever blocks the main process.

import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom, type WebSocketMinimal } from '@tldraw/sync-core'
import type { MessageEvent as PortMessageEvent, MessagePortMain } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
	isBoardId,
	type BackendMethods,
	type BackendRequest,
	type BackendResponse,
	type BoardSummary,
} from '../shared/api'
import { assetFilePath, isAssetHash } from '../shared/asset-files'
import { createLocaldrawSchema } from '../shared/media-schema'

const [dbPath, assetsDir] = process.argv.slice(2)
if (!dbPath || !assetsDir) throw new Error('backend: expected <database path> <assets dir> arguments')

const MAX_ASSET_BYTES = 1024 * 1024 * 1024

const db = new DatabaseSync(dbPath)
db.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA synchronous = NORMAL;
	PRAGMA foreign_keys = ON;

	CREATE TABLE IF NOT EXISTS boards (
		id         TEXT PRIMARY KEY,
		title      TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	) STRICT;

	-- Metadata for stored files; the bytes live on disk (see shared/asset-files.ts).
	CREATE TABLE IF NOT EXISTS assets (
		hash TEXT PRIMARY KEY,
		mime TEXT NOT NULL,
		name TEXT NOT NULL,
		size INTEGER NOT NULL
	) STRICT;

	-- Per-board view state (current page, camera, selection) so boards reopen where you left them.
	CREATE TABLE IF NOT EXISTS sessions (
		board_id   TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
		state      TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	) STRICT;
`)

moveAssetBlobsToDisk()

/** Assets used to be stored as BLOBs in the database; move any that still are into files. */
function moveAssetBlobsToDisk() {
	const columns = db.prepare('PRAGMA table_info(assets)').all() as { name: string }[]
	if (!columns.some((column) => column.name === 'data')) return

	for (const row of db.prepare('SELECT hash, data FROM assets').iterate()) {
		const { hash, data } = row as { hash: string; data: Uint8Array }
		const file = assetFilePath(assetsDir, hash)
		if (existsSync(file)) continue
		mkdirSync(path.dirname(file), { recursive: true })
		writeFileSync(`${file}.tmp`, data)
		renameSync(`${file}.tmp`, file)
	}
	// Only drop the column once every file is safely on disk; rerunning is harmless.
	db.exec('ALTER TABLE assets DROP COLUMN data; VACUUM;')
}

const stmts = {
	listBoards: db.prepare(
		'SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM boards ORDER BY updated_at DESC'
	),
	insertBoard: db.prepare('INSERT INTO boards (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'),
	boardExists: db.prepare('SELECT 1 FROM boards WHERE id = ?'),
	touchBoard: db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?'),
	renameBoard: db.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ?'),
	insertAsset: db.prepare('INSERT OR IGNORE INTO assets (hash, mime, name, size) VALUES (?, ?, ?, ?)'),
	getAssetInfo: db.prepare('SELECT mime, size FROM assets WHERE hash = ?'),
	getSession: db.prepare('SELECT state FROM sessions WHERE board_id = ?'),
	saveSession: db.prepare(
		`INSERT INTO sessions (board_id, state, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT (board_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
	),
	lastBoardId: db.prepare('SELECT board_id FROM sessions ORDER BY updated_at DESC LIMIT 1'),
}

const MAX_SESSION_BYTES = 1_000_000
const MAX_TITLE_LENGTH = 200

// --- sync rooms -------------------------------------------------------------

// Each board's tldraw records live in their own `r_<id>_*` tables, created and
// migrated by SQLiteSyncStorage. The prefix is safe to interpolate because
// board ids are validated as 32 hex chars before they get here.
const rooms = new Map<string, TLSocketRoom>()
const schema = createLocaldrawSchema()

function getRoom(boardId: string): TLSocketRoom {
	const existing = rooms.get(boardId)
	if (existing && !existing.isClosed()) return existing

	const sql = new NodeSqliteWrapper(db, { tablePrefix: `r_${boardId}_` })
	const storage = new SQLiteSyncStorage({
		sql,
		onChange: () => stmts.touchBoard.run(Date.now(), boardId),
	})
	const room = new TLSocketRoom({
		schema,
		storage,
		onSessionRemoved(room, { numSessionsRemaining }) {
			if (numSessionsRemaining > 0) return
			room.close()
			rooms.delete(boardId)
		},
	})
	rooms.set(boardId, room)
	return room
}

/** Adapts an Electron MessagePortMain to the socket shape TLSocketRoom expects. */
class PortSocket implements WebSocketMinimal {
	readyState = 1 // OPEN

	constructor(private port: MessagePortMain) {
		port.on('close', () => {
			this.readyState = 3 // CLOSED
		})
	}

	send(data: string) {
		if (this.readyState === 1) this.port.postMessage(data)
	}

	close() {
		if (this.readyState === 3) return
		this.readyState = 3
		this.port.close()
	}

	addEventListener(type: 'message' | 'close' | 'error', listener: (event: any) => void) {
		// MessagePortMain has no 'error' event; message events carry `.data` like a WebSocket's.
		if (type !== 'error') this.port.on(type as 'message', listener)
	}

	removeEventListener(type: 'message' | 'close' | 'error', listener: (event: any) => void) {
		if (type !== 'error') this.port.off(type as 'message', listener)
	}
}

function connectBoard(boardId: string, sessionId: string, port: MessagePortMain) {
	if (!isBoardId(boardId) || !stmts.boardExists.get(boardId) || typeof sessionId !== 'string') {
		port.close()
		return
	}
	// The client reuses one session id per window, so a quick reconnect would
	// share an id with the connection it replaces, and that old connection's
	// close event would end the new session (and the room). A unique id per
	// connection keeps them apart.
	getRoom(boardId).handleSocketConnect({ sessionId: `${sessionId}:${randomUUID()}`, socket: new PortSocket(port) })
	port.start()
}

// --- request/response methods ------------------------------------------------

const methods: BackendMethods = {
	listBoards() {
		return stmts.listBoards.all() as unknown as BoardSummary[]
	},

	createBoard() {
		const now = Date.now()
		const board: BoardSummary = {
			id: randomUUID().replaceAll('-', ''),
			title: 'Untitled',
			createdAt: now,
			updatedAt: now,
		}
		stmts.insertBoard.run(board.id, board.title, board.createdAt, board.updatedAt)
		return board
	},

	async putAsset({ name, mime, data }) {
		if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_ASSET_BYTES) {
			throw new Error('Invalid asset data')
		}
		// Content-addressed, so the same file dropped into many boards is stored once.
		const hash = createHash('sha256').update(data).digest('hex')
		const file = assetFilePath(assetsDir, hash)
		const exists = await stat(file).then(
			() => true,
			() => false
		)
		if (!exists) {
			await mkdir(path.dirname(file), { recursive: true })
			// Write then rename, so a crash never leaves a truncated file under the final name.
			const tmp = `${file}.${randomUUID()}.tmp`
			await writeFile(tmp, data)
			await rename(tmp, file)
		}
		stmts.insertAsset.run(hash, String(mime), String(name), data.byteLength)
		return { hash }
	},

	getAssetInfo(hash) {
		if (!isAssetHash(hash)) return null
		const row = stmts.getAssetInfo.get(hash) as { mime: string; size: number } | undefined
		return row ?? null
	},

	getSession(boardId) {
		if (!isBoardId(boardId)) throw new Error('Invalid board id')
		const row = stmts.getSession.get(boardId) as { state: string } | undefined
		return row ? JSON.parse(row.state) : null
	},

	renameBoard(boardId, title) {
		if (!isBoardId(boardId)) throw new Error('Invalid board id')
		const trimmed = typeof title === 'string' ? title.trim() : ''
		if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) throw new Error('Invalid board title')
		stmts.renameBoard.run(trimmed, Date.now(), boardId)
	},

	saveSession(boardId, state) {
		if (!isBoardId(boardId)) throw new Error('Invalid board id')
		const json = JSON.stringify(state)
		if (json === undefined || json.length > MAX_SESSION_BYTES) throw new Error('Invalid session state')
		stmts.saveSession.run(boardId, json, Date.now())
	},

	getLastBoardId() {
		const row = stmts.lastBoardId.get() as { board_id: string } | undefined
		return row?.board_id ?? null
	},
}

// --- wiring ------------------------------------------------------------------

process.parentPort.on('message', async (event: PortMessageEvent) => {
	const msg = event.data as BackendRequest

	if (msg.kind === 'connect') {
		const port = event.ports[0]
		if (port) connectBoard(msg.boardId, msg.sessionId, port)
		return
	}

	let response: BackendResponse
	try {
		const fn = methods[msg.method] as (...args: unknown[]) => unknown
		response = { kind: 'result', id: msg.id, ok: true, value: await fn(...msg.args) }
	} catch (e) {
		response = { kind: 'result', id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) }
	}
	process.parentPort.postMessage(response)
})

function shutdown() {
	for (const room of rooms.values()) room.close()
	db.close()
}
process.on('exit', shutdown)
