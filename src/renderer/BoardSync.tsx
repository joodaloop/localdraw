import { useSync } from '@tldraw/sync'
import { useCallback, useEffect } from 'react'
import type { TLStore } from 'tldraw'
import { assetStore } from './asset-store'
import { BoardSocket } from './board-socket'
import { allAssetUtils, allShapeUtils } from './media'
import { preloadSession } from './sessions'

interface BoardSyncProps {
	boardId: string
	/** Called with the synced store once it (and its saved view state) is ready, and with null on teardown. */
	onReady(boardId: string, store: TLStore | null): void
	/** Called with true while the board is reconnecting (edits are kept until it's back), and false once online. */
	onOffline(boardId: string, isOffline: boolean): void
	onError(boardId: string, error: Error): void
}

/**
 * Renders nothing: keeps one board's store connected to the backend and synced.
 * Unmounting closes the connection.
 */
export function BoardSync({ boardId, onReady, onOffline, onError }: BoardSyncProps) {
	const connect = useCallback(
		({ sessionId }: { sessionId: string }) => new BoardSocket(boardId, sessionId),
		[boardId]
	)
	const result = useSync({ connect, assets: assetStore, shapeUtils: allShapeUtils, assetUtils: allAssetUtils })
	const store = result.status === 'synced-remote' ? result.store : null
	const error = result.status === 'error' ? result.error : null
	const isOffline = result.status === 'synced-remote' && result.connectionStatus === 'offline'

	useEffect(() => {
		if (!store) return
		let cancelled = false
		preloadSession(boardId)
			.catch(console.error)
			.finally(() => {
				if (!cancelled) onReady(boardId, store)
			})
		return () => {
			cancelled = true
			onReady(boardId, null)
		}
	}, [boardId, store, onReady])

	useEffect(() => {
		if (!isOffline) return
		onOffline(boardId, true)
		return () => onOffline(boardId, false)
	}, [boardId, isOffline, onOffline])

	useEffect(() => {
		if (error) onError(boardId, error)
	}, [boardId, error, onError])

	return null
}
