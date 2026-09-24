import type { TLPersistentClientSocket, TLSocketStatusChangeEvent } from '@tldraw/sync-core'
import { atom } from 'tldraw'
import type { BoardConnection } from '../shared/api'

// The sync protocol's message types are internal to tldraw; this socket only
// serializes them, so it treats them as opaque objects.
type ServerMessage = object
type ClientMessage = object

// After the backend closes a board's connection (e.g. while it restarts), retry
// every second for 8 seconds, then fail. Edits made meanwhile are kept by the
// sync client and sent once reconnected.
const RETRY_INTERVAL_MS = 1000
const MAX_RETRIES = 8
// A connection must last this long to count as recovered. Otherwise a backend that
// crashes on every reconnect (e.g. on a record it can't handle) would be retried forever.
const STABLE_CONNECTION_MS = 10_000

/**
 * A tldraw sync client socket that talks to the backend process over a
 * MessagePort instead of a WebSocket: no network stack, no open local port.
 */
export class BoardSocket implements TLPersistentClientSocket<ClientMessage, ServerMessage> {
	// An atom, so `useSync` re-renders when the status changes.
	private status = atom<TLPersistentClientSocket['connectionStatus']>('board socket status', 'offline')
	private messageListeners = new Set<(msg: ServerMessage) => void>()
	private statusListeners = new Set<(event: TLSocketStatusChangeEvent) => void>()
	private connection: BoardConnection | null = null
	private disposed = false
	private retries = 0
	private openedAt = 0
	private retryTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private boardId: string,
		private sessionId: string
	) {
		this.open()
	}

	get connectionStatus() {
		return this.status.get()
	}

	private setStatus(event: TLSocketStatusChangeEvent) {
		if (this.status.get() === event.status) return
		this.status.set(event.status)
		for (const listener of this.statusListeners) listener(event)
	}

	private open() {
		const connection = window.localdraw.connectBoard(this.boardId, this.sessionId, {
			onMessage: (data) => {
				let msg: ServerMessage
				try {
					msg = JSON.parse(data)
				} catch {
					// A corrupt message means we may have missed a change; resync from scratch.
					this.restart()
					return
				}
				for (const listener of this.messageListeners) listener(msg)
			},
			onClose: () => {
				if (this.connection !== connection) return
				this.connection = null
				if (Date.now() - this.openedAt >= STABLE_CONNECTION_MS) this.retries = 0
				// The backend only closes a board's port when it can't serve it: the board is
				// unknown, or the backend is restarting. Retry a few times to ride out a restart.
				if (this.retries >= MAX_RETRIES) {
					window.localdraw.logError(`board ${this.boardId}: connection closed, giving up after ${this.retries} retries`)
					this.setStatus({ status: 'error', reason: 'The connection to the board was lost' })
					return
				}
				this.retries++
				window.localdraw.logError(`board ${this.boardId}: connection closed, reconnecting (attempt ${this.retries})`)
				this.setStatus({ status: 'offline' })
				this.retryTimer = setTimeout(() => {
					this.retryTimer = null
					this.open()
				}, RETRY_INTERVAL_MS)
			},
		})
		this.connection = connection
		this.openedAt = Date.now()
		// Messages sent now are queued by the port until the backend starts it.
		this.setStatus({ status: 'online' })
	}

	sendMessage(msg: ClientMessage) {
		if (this.status.get() !== 'online') return
		this.connection?.send(JSON.stringify(msg))
	}

	onReceiveMessage = (callback: (msg: ServerMessage) => void) => {
		this.messageListeners.add(callback)
		return () => void this.messageListeners.delete(callback)
	}

	onStatusChange = (callback: (event: TLSocketStatusChangeEvent) => void) => {
		this.statusListeners.add(callback)
		return () => void this.statusListeners.delete(callback)
	}

	/** Called by tldraw's sync client when the connection looks unhealthy, and on corrupt messages. */
	restart() {
		if (this.disposed) return
		this.disconnect()
		this.open()
	}

	close() {
		this.disposed = true
		this.disconnect()
	}

	private disconnect() {
		if (this.retryTimer) clearTimeout(this.retryTimer)
		this.retryTimer = null
		const connection = this.connection
		this.connection = null
		connection?.close()
		this.setStatus({ status: 'offline' })
	}
}
