import type { TLPersistentClientSocket, TLSocketStatusChangeEvent } from '@tldraw/sync-core'
import { atom } from 'tldraw'
import type { BoardConnection } from '../shared/api'

// The sync protocol's message types are internal to tldraw; this socket only
// serializes them, so it treats them as opaque objects.
type ServerMessage = object
type ClientMessage = object

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
				// No retrying: the backend only closes a board's port when it can't serve it
				// (unknown board, backend restart). Report an error so the board is dropped
				// from the connected set; opening it again makes a fresh connection.
				this.setStatus({ status: 'error', reason: 'The board connection was closed' })
			},
		})
		this.connection = connection
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
		const connection = this.connection
		this.connection = null
		connection?.close()
		this.setStatus({ status: 'offline' })
	}
}
