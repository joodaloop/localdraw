import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createTLStore, Tldraw, type Editor, type TLStore } from 'tldraw'
import type { BoardSummary } from '../shared/api'
import { assetStore } from './asset-store'
import { showBoard } from './board-mirror'
import { allAssetUtils, allShapeUtils, customAssetUtils, customShapeUtils, MAX_ASSET_SIZE } from './media'
import { registerBookmarkHandler } from './media/bookmarks'
import { getSavedSession, trackSession } from './sessions'
import { Sidebar } from './Sidebar'
import { Toolbar } from './Toolbar'
import { WarmBoard } from './WarmBoard'

// Bundle tldraw's fonts, icons and translations instead of loading them from its CDN.
// Vite already resolves these to absolute localdraw:// URLs, which tldraw's default
// formatter would mangle (it only treats http(s) and data: URLs as absolute).
const assetUrls = getAssetUrlsByImport((url) => url)
const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY

/** How many boards stay connected in the background for instant switching. */
const MAX_WARM_BOARDS = 5

interface ShownBoard {
	id: string
	/** The board's synced store currently mirrored into the editor. */
	store: TLStore
}

export function App() {
	const [boards, setBoards] = useState<BoardSummary[] | null>(null)
	// Most recently used first. Each id gets a <WarmBoard> keeping its store synced.
	const [warmIds, setWarmIds] = useState<string[]>([])
	const [readyStores, setReadyStores] = useState<ReadonlyMap<string, TLStore>>(new Map())
	// The board the user asked for, and the board whose store the editor has.
	// They differ only while the target is still syncing; the editor keeps
	// showing the previous board until then instead of a loading screen.
	const [targetId, setTargetId] = useState<string | null>(null)
	const [shown, setShown] = useState<ShownBoard | null>(null)
	const [error, setError] = useState<string | null>(null)

	// The editor's own store lives as long as the app. Boards are swapped into it
	// (see board-mirror.ts), so the editor and its UI are never remounted.
	const [editorStore] = useState(() =>
		createTLStore({ assets: assetStore, shapeUtils: allShapeUtils, assetUtils: allAssetUtils })
	)
	const [editor, setEditor] = useState<Editor | null>(null)
	const stopTrackingSession = useRef<(() => void) | null>(null)

	const handleMount = useCallback((editor: Editor) => {
		registerBookmarkHandler(editor)
		setEditor(editor)
	}, [])

	// The shown and target boards must never be evicted from the warm set.
	const pinnedIds = useRef<string[]>([])
	pinnedIds.current = [shown?.id, targetId].filter((id) => id != null)

	const warm = useCallback((boardId: string) => {
		setWarmIds((ids) => {
			const next = [boardId, ...ids.filter((id) => id !== boardId)].slice(0, MAX_WARM_BOARDS)
			for (const id of pinnedIds.current) if (!next.includes(id)) next.push(id)
			return next
		})
	}, [])

	const open = useCallback(
		(boardId: string) => {
			setError(null)
			setTargetId(boardId)
			warm(boardId)
		},
		[warm]
	)

	const handleReady = useCallback((boardId: string, store: TLStore | null) => {
		setReadyStores((prev) => {
			const next = new Map(prev)
			if (store) next.set(boardId, store)
			else next.delete(boardId)
			return next
		})
	}, [])

	const handleError = useCallback((boardId: string, err: Error) => {
		setWarmIds((ids) => ids.filter((id) => id !== boardId))
		setTargetId((target) => {
			if (target !== boardId) return target
			setError(`Couldn't open board: ${err.message}`)
			return null
		})
	}, [])

	// On launch, reopen the board viewed last.
	useEffect(() => {
		let cancelled = false
		Promise.all([window.localdraw.listBoards(), window.localdraw.getLastBoardId()]).then(([list, lastId]) => {
			if (cancelled) return
			setBoards(list)
			const initial = list.find((board) => board.id === lastId)?.id ?? list[0]?.id
			if (initial) open(initial)
		}, console.error)
		return () => {
			cancelled = true
		}
	}, [open])

	// Swap the target board into the editor once its store is synced. Also
	// re-swaps if the shown board's store is replaced (e.g. after a reconnect error).
	useEffect(() => {
		if (!targetId) return
		const store = readyStores.get(targetId)
		if (!store || (shown?.id === targetId && shown.store === store)) return
		// Stop tracking before the swap, or the old board would save the new board's view.
		stopTrackingSession.current?.()
		showBoard(editorStore, editor, store, getSavedSession(targetId))
		stopTrackingSession.current = trackSession(targetId, editorStore)
		setShown({ id: targetId, store })
	}, [targetId, readyStores, shown, editor, editorStore])

	useEffect(() => () => stopTrackingSession.current?.(), [])

	async function createBoard() {
		try {
			const board = await window.localdraw.createBoard()
			setBoards((list) => [board, ...(list ?? [])])
			open(board.id)
		} catch (err) {
			setError(`Couldn't create board: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	const pendingId = targetId && targetId !== shown?.id ? targetId : null
	const activeId = targetId ?? shown?.id ?? null
	const activeTitle = boards?.find((board) => board.id === activeId)?.title ?? null

	return (
		<div className="app">
			<Toolbar title={activeTitle} onCreate={createBoard} />
			<Sidebar
				boards={boards}
				activeId={activeId}
				pendingId={pendingId}
				error={error}
				onOpen={open}
				onWarm={warm}
			/>
			<main className="canvas">
				{/* Mounted once the first board is loaded, then never unmounted. */}
				{shown ? (
					<Tldraw
						store={editorStore}
						onMount={handleMount}
						shapeUtils={customShapeUtils}
						assetUtils={customAssetUtils}
						maxAssetSize={MAX_ASSET_SIZE}
						assetUrls={assetUrls}
						licenseKey={licenseKey}
					/>
				) : (
					boards?.length === 0 && <p className="canvas-empty">Create a board to get started.</p>
				)}
			</main>
			{warmIds.map((id) => (
				<WarmBoard key={id} boardId={id} onReady={handleReady} onError={handleError} />
			))}
		</div>
	)
}
