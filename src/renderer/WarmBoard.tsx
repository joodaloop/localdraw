import { useSync } from '@tldraw/sync'
import { useCallback, useEffect } from 'react'
import type { TLStore } from 'tldraw'
import { assetStore } from './asset-store'
import { BoardSocket } from './board-socket'
import { allAssetUtils, allShapeUtils } from './media'
import { preloadSession } from './sessions'

interface WarmBoardProps {
	boardId: string
	/** Called with the synced store once it (and its saved view state) is ready, and with null on teardown. */
	onReady(boardId: string, store: TLStore | null): void
	onError(boardId: string, error: Error): void
}

/**
 * Renders nothing: keeps one board's store connected and synced so the editor
 * can switch to it instantly. Unmounting closes the connection.
 */
export function WarmBoard({ boardId, onReady, onError }: WarmBoardProps) {
	const connect = useCallback(
		({ sessionId }: { sessionId: string }) => new BoardSocket(boardId, sessionId),
		[boardId]
	)
	const result = useSync({ connect, assets: assetStore, shapeUtils: allShapeUtils, assetUtils: allAssetUtils })
	const store = result.status === 'synced-remote' ? result.store : null
	const error = result.status === 'error' ? result.error : null

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
		if (error) onError(boardId, error)
	}, [boardId, error, onError])

	return null
}
