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
	type TextSearchResult,
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

	-- Plain text pulled out of every shape's label, one row per shape, kept in sync with each
	-- board's own r_<id>_documents table (see reindexBoardText). Mirrored into an FTS5 index
	-- below so home-page search can run across every board at once.
	CREATE TABLE IF NOT EXISTS shape_text (
		id       TEXT PRIMARY KEY, -- '<boardId>:<recordId>'
		board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
		text     TEXT NOT NULL
	) STRICT;
	CREATE INDEX IF NOT EXISTS idx_shape_text_board_id ON shape_text(board_id);

`)

// Bump when shape_text_fts's DDL (tokenizer, columns, ...) needs to change: `user_version`
// gates a one-time rebuild rather than paying for one on every launch. The reindex loop below
// already repopulates `shape_text` from scratch each launch regardless, so once the FTS index
// itself is at the current version there's nothing more to do here.
const SHAPE_TEXT_FTS_VERSION = 1
const { user_version: schemaVersion } = db.prepare('PRAGMA user_version').get() as { user_version: number }
if (schemaVersion < SHAPE_TEXT_FTS_VERSION) {
	db.exec(`
		-- Drop the triggers before clearing the table: otherwise the DELETE fires the old
		-- AFTER DELETE trigger, which asks the (about to be replaced) FTS index to remove
		-- content it may not actually have — a mismatch FTS5 reports as "malformed".
		DROP TRIGGER IF EXISTS shape_text_ai;
		DROP TRIGGER IF EXISTS shape_text_ad;
		DROP TRIGGER IF EXISTS shape_text_au;
		DROP TABLE IF EXISTS shape_text_fts;
		-- Rebuilt from scratch by the reindex loop below.
		DELETE FROM shape_text;

		-- Trigram supports true substring matches ("uly" finding "July"); a word-based
		-- tokenizer (e.g. porter) only matches from the start of a word.
		CREATE VIRTUAL TABLE shape_text_fts USING fts5(
			text,
			content = 'shape_text',
			content_rowid = 'rowid',
			tokenize = 'trigram'
		);

		CREATE TRIGGER shape_text_ai AFTER INSERT ON shape_text BEGIN
			INSERT INTO shape_text_fts (rowid, text) VALUES (new.rowid, new.text);
		END;
		CREATE TRIGGER shape_text_ad AFTER DELETE ON shape_text BEGIN
			INSERT INTO shape_text_fts (shape_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
		END;
		CREATE TRIGGER shape_text_au AFTER UPDATE ON shape_text BEGIN
			INSERT INTO shape_text_fts (shape_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
			INSERT INTO shape_text_fts (rowid, text) VALUES (new.rowid, new.text);
		END;
	`)
	db.exec(`PRAGMA user_version = ${SHAPE_TEXT_FTS_VERSION}`)
}

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
	listBoardIds: db.prepare('SELECT id FROM boards'),
	tableExists: db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"),
	deleteShapeText: db.prepare('DELETE FROM shape_text WHERE board_id = ?'),
	insertShapeText: db.prepare('INSERT INTO shape_text (id, board_id, text) VALUES (?, ?, ?)'),
	searchTextFts: db.prepare(`
		SELECT st.board_id AS boardId, substr(st.id, length(st.board_id) + 2) AS shapeId,
		       b.title AS boardTitle, st.text AS text
		FROM shape_text_fts
		JOIN shape_text st ON st.rowid = shape_text_fts.rowid
		JOIN boards b ON b.id = st.board_id
		WHERE shape_text_fts MATCH ?
		ORDER BY rank
		LIMIT 50
	`),
}

const MAX_SESSION_BYTES = 1_000_000
const MAX_TITLE_LENGTH = 200

// --- text search index --------------------------------------------------------

/** Rich text is a ProseMirror-style doc: `{ content: [{ content: [{ text }] }] }`. */
function plainTextFromRichText(node: unknown): string {
	if (!node || typeof node !== 'object') return ''
	const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown }
	if (typeof text === 'string') return text
	if (type === 'hardBreak') return '\n'
	if (Array.isArray(content)) {
		const text = content.map(plainTextFromRichText).join('')
		// Inline nodes (including differently styled text) remain contiguous; blocks
		// terminate with a separator so paragraphs and list items cannot merge words.
		return type === 'paragraph' || type === 'heading' || type === 'codeBlock' ||
			type === 'blockquote' || type === 'listItem' ? `${text}\n` : text
	}
	return ''
}

/** The text a shape shows, mirroring what each shape util's `getText()` would return. */
function extractShapeText(record: unknown): string | null {
	if (!record || typeof record !== 'object') return null
	const { typeName, props } = record as { typeName?: unknown; props?: unknown }
	if (typeName !== 'shape' || !props || typeof props !== 'object') return null
	const { richText, text } = props as { richText?: unknown; text?: unknown }
	// `text` is a fallback for shapes stored before tldraw's richText migration.
	const plainText = richText ? plainTextFromRichText(richText) : typeof text === 'string' ? text : ''
	const trimmed = plainText.trim().replace(/\s+/g, ' ')
	return trimmed || null
}

/** Re-derives a board's shape_text rows from its sync storage. No-ops for boards never opened. */
function reindexBoardText(boardId: string) {
	const table = `r_${boardId}_documents`
	if (!stmts.tableExists.get(table)) return

	const rows = db.prepare(`SELECT id, state FROM ${table} WHERE id LIKE 'shape:%'`).all() as {
		id: string
		state: Uint8Array
	}[]
	const entries: { id: string; text: string }[] = []
	for (const row of rows) {
		try {
			const text = extractShapeText(JSON.parse(Buffer.from(row.state).toString('utf8')))
			if (text) entries.push({ id: row.id, text })
		} catch {
			// Skip anything that doesn't parse; it just won't be searchable.
		}
	}

	db.exec('BEGIN')
	try {
		stmts.deleteShapeText.run(boardId)
		for (const entry of entries) stmts.insertShapeText.run(`${boardId}:${entry.id}`, boardId, entry.text)
		db.exec('COMMIT')
	} catch (e) {
		db.exec('ROLLBACK')
		throw e
	}
}

// Reindexing scans a whole board's shapes, so batch rapid edits (e.g. dragging) into one pass.
const reindexTimers = new Map<string, NodeJS.Timeout>()
function scheduleReindex(boardId: string) {
	clearTimeout(reindexTimers.get(boardId))
	reindexTimers.set(
		boardId,
		setTimeout(() => {
			reindexTimers.delete(boardId)
			try {
				reindexBoardText(boardId)
			} catch (e) {
				console.error(`reindexing ${boardId} failed:`, e)
			}
		}, 1000)
	)
}

// Covers boards edited before this feature existed, or left stale by an unclean shutdown.
for (const { id } of stmts.listBoardIds.all() as { id: string }[]) {
	try {
		reindexBoardText(id)
	} catch (e) {
		console.error(`initial reindex of ${id} failed:`, e)
	}
}

function splitTerms(query: string): string[] {
	return query.trim().split(/\s+/).filter(Boolean).slice(0, 8)
}

// The trigram tokenizer indexes runs of 3 characters, so a shorter term can't match
// anything through FTS (not an error, just always empty).
const MIN_FTS_TERM_LENGTH = 3

function buildFtsMatch(terms: string[]): string {
	// Each term becomes a quoted substring match; FTS5 syntax characters (like `:` or
	// `"`) inside a quoted phrase are just literal text.
	return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ')
}

function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Plain substring scan for queries FTS can't handle (a term under 3 characters). Slower, but
 * only reached for short queries, where shape_text is small enough that it doesn't matter. */
function searchTextLike(terms: string[]): TextSearchResult[] {
	const conditions = terms.map(() => "st.text LIKE ? ESCAPE '\\'").join(' AND ')
	const params = terms.map((term) => `%${escapeLike(term)}%`)
	return db
		.prepare(
			`SELECT st.board_id AS boardId, substr(st.id, length(st.board_id) + 2) AS shapeId,
			        b.title AS boardTitle, st.text AS text
			 FROM shape_text st
			 JOIN boards b ON b.id = st.board_id
			 WHERE ${conditions}
			 LIMIT 50`
		)
		.all(...params) as unknown as TextSearchResult[]
}

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
		onChange: () => {
			stmts.touchBoard.run(Date.now(), boardId)
			scheduleReindex(boardId)
		},
	})
	const room = new TLSocketRoom({
		schema,
		storage,
		// Goes to stderr, which the main process copies into the log file.
		log: { warn: console.warn, error: console.error },
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
		console.error(`refused connection to unknown board ${String(boardId)}`)
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

	createBoard(title) {
		const now = Date.now()
		const board: BoardSummary = {
			id: randomUUID().replaceAll('-', ''),
			title: title?.trim() || 'Untitled',
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

	searchText(query) {
		const terms = splitTerms(String(query ?? ''))
		if (terms.length === 0) return []
		// A term under 3 characters has no trigrams to match through FTS at all, so any
		// short term routes the whole query through the slower LIKE-based fallback instead.
		if (terms.some((term) => term.length < MIN_FTS_TERM_LENGTH)) return searchTextLike(terms)
		return stmts.searchTextFts.all(buildFtsMatch(terms)) as unknown as TextSearchResult[]
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
