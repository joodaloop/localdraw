import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { TLRemoteSyncError } from '@tldraw/sync'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createTLStore, Tldraw, type Editor, type TLStore } from 'tldraw'
import type { BoardSummary } from '../shared/api'
import { assetStore } from './asset-store'
import { showBoard } from './board-mirror'
import { allAssetUtils, allShapeUtils, customAssetUtils, customShapeUtils, MAX_ASSET_SIZE } from './media'
import { registerBookmarkHandler } from './media/bookmarks'
import { getSavedSession, trackSession } from './sessions'
import { Home } from './Home'
import { Toolbar } from './Toolbar'
import { BoardSync } from './BoardSync'
import type { SyncState } from './SyncStatus'

// Bundle tldraw's fonts, icons and translations instead of loading them from its CDN.
// Vite already resolves these to absolute localdraw:// URLs, which tldraw's default
// formatter would mangle (it only treats http(s) and data: URLs as absolute).
const assetUrls = getAssetUrlsByImport((url) => url)
const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY

/**
 * 'opening' keeps the current screen up while the requested board loads, so
 * nothing flashes; the editor appears once the board is swapped in.
 */
type View = 'home' | 'opening' | 'board'

interface ShownBoard {
	id: string
	/** The board's synced store currently mirrored into the editor. */
	store: TLStore
}

export function App() {
	const [boards, setBoards] = useState<BoardSummary[] | null>(null)
	// Boards whose connection failed, with the reason; they reconnect when opened again (or retried).
	const [failures, setFailures] = useState<ReadonlyMap<string, string>>(new Map())
	// Boards currently reconnecting; their edits are kept and sent once they're back.
	const [offlineIds, setOfflineIds] = useState<ReadonlySet<string>>(new Set())
	const [readyStores, setReadyStores] = useState<ReadonlyMap<string, TLStore>>(new Map())
	// The board the user asked for, and the board whose store the editor has.
	// They differ only while the target is still syncing; the editor keeps
	// showing the previous board until then instead of a loading screen.
	const [targetId, setTargetId] = useState<string | null>(null)
	const [shown, setShown] = useState<ShownBoard | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [view, setView] = useState<View>('home')

	// The editor's own store lives as long as the app. Boards are swapped into it
	// (see board-mirror.ts), so the editor and its UI are never remounted.
	const [editorStore] = useState(() =>
		createTLStore({ assets: assetStore, shapeUtils: allShapeUtils, assetUtils: allAssetUtils })
	)
	const [editor, setEditor] = useState<Editor | null>(null)
	const stopTrackingSession = useRef<(() => void) | null>(null)
	// For callbacks that need current state without being recreated on every change.
	const latest = useRef({ boards, targetId, shownId: shown?.id })
	latest.current = { boards, targetId, shownId: shown?.id }

	// The editor is unmounted while home is showing; boards are then swapped into the store alone.
	const handleMount = useCallback((editor: Editor) => {
		registerBookmarkHandler(editor)
		setEditor(editor)
		return () => setEditor(null)
	}, [])

	// Only the shown board is connected, plus the one being opened while it loads.
	const connectedIds = [...new Set([shown?.id, targetId])].filter(
		(id): id is string => id != null && !failures.has(id)
	)

	/** (Re)connects a board and makes it the target; it's swapped into the editor once synced. */
	const connect = useCallback((boardId: string) => {
		setError(null)
		setFailures((prev) => {
			if (!prev.has(boardId)) return prev
			const next = new Map(prev)
			next.delete(boardId)
			return next
		})
		setTargetId(boardId)
	}, [])

	const open = useCallback(
		(boardId: string) => {
			connect(boardId)
			setView('opening')
		},
		[connect]
	)

	const handleReady = useCallback((boardId: string, store: TLStore | null) => {
		setReadyStores((prev) => {
			const next = new Map(prev)
			if (store) next.set(boardId, store)
			else next.delete(boardId)
			return next
		})
	}, [])

	const handleOffline = useCallback((boardId: string, isOffline: boolean) => {
		setOfflineIds((prev) => {
			if (prev.has(boardId) === isOffline) return prev
			const next = new Set(prev)
			if (isOffline) next.add(boardId)
			else next.delete(boardId)
			return next
		})
	}, [])

	const handleError = useCallback((boardId: string, err: Error) => {
		const reason = err instanceof TLRemoteSyncError ? err.reason : err.message
		window.localdraw.logError(`board ${boardId} failed: ${reason}`)
		setFailures((prev) => new Map(prev).set(boardId, reason))

		const { boards, targetId, shownId } = latest.current
		if (targetId !== boardId) return
		const title = boards?.find((board) => board.id === boardId)?.title ?? 'Untitled'
		if (shownId === boardId) {
			// The editor keeps showing it, read-only, and the toolbar offers a retry.
			setError(`Lost the connection to “${title}”: ${reason}`)
		} else {
			setError(`Couldn't open “${title}”: ${reason}`)
			setTargetId(null)
			setView((view) => (view === 'opening' ? 'home' : view))
		}
	}, [])

	const retryShownBoard = useCallback(() => {
		if (shown) connect(shown.id)
	}, [shown, connect])

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

	// A failed board's edits can't be saved, so stop taking them until it's back. After a
	// retry the editor still holds the dead store until the fresh one is swapped in.
	const shownFailure = shown ? (failures.get(shown.id) ?? null) : null
	const isShownStale = shown != null && shown.id === targetId && readyStores.get(shown.id) !== shown.store
	const isReadonly = shownFailure !== null || isShownStale
	useEffect(() => {
		editor?.updateInstanceState({ isReadonly })
	}, [editor, isReadonly])

	useEffect(() => window.localdraw.onGoHome(() => setView('home')), [])

	// Show the editor once the requested board is in it.
	useEffect(() => {
		if (view === 'opening' && shown && shown.id === targetId) setView('board')
	}, [view, shown, targetId])

	// Refresh the list (titles, edit times) whenever home is shown.
	useEffect(() => {
		if (view !== 'home') return
		let cancelled = false
		window.localdraw.listBoards().then((list) => {
			if (!cancelled) setBoards(list)
		}, console.error)
		return () => {
			cancelled = true
		}
	}, [view])

	async function createBoard() {
		try {
			const board = await window.localdraw.createBoard()
			setBoards((list) => [board, ...(list ?? [])])
			open(board.id)
		} catch (err) {
			setError(`Couldn't create board: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	async function renameShownBoard(title: string) {
		if (!shown) return
		const boardId = shown.id
		// Show the new name immediately; reload the list if saving fails.
		setBoards((list) => list?.map((board) => (board.id === boardId ? { ...board, title } : board)) ?? list)
		try {
			await window.localdraw.renameBoard(boardId, title)
		} catch (err) {
			console.error(err)
			window.localdraw.listBoards().then(setBoards, console.error)
		}
	}

	const pendingId = targetId && targetId !== shown?.id ? targetId : null
	const shownTitle = shown ? (boards?.find((board) => board.id === shown.id)?.title ?? 'Untitled') : null
	// While a board loads, stay on home if that's where it was opened from; on launch show nothing.
	const showEditor = view === 'board' && shown
	const showHome = view === 'home' || (view === 'opening' && shown)
	const syncState: SyncState | null = !showEditor
		? null
		: shownFailure !== null
			? { status: 'failed', reason: shownFailure }
			: offlineIds.has(shown.id) || isShownStale
				? { status: 'reconnecting' }
				: null

	// The native title bar is hidden, but the window title still names the window in
	// Mission Control, the Window menu and the Dock.
	const windowTitle = showEditor && shownTitle ? `${shownTitle} — Localdraw` : 'Localdraw'
	useEffect(() => {
		document.title = windowTitle
	}, [windowTitle])

	return (
		<div className="app">
			<Toolbar
				isHome={!showEditor}
				title={showEditor ? shownTitle : null}
				syncState={syncState}
				onRetrySync={retryShownBoard}
				onHome={() => setView('home')}
				onRename={renameShownBoard}
			/>
			<main className="main">
				{showEditor ? (
					<Tldraw
						store={editorStore}
						onMount={handleMount}
						shapeUtils={customShapeUtils}
						assetUtils={customAssetUtils}
						maxAssetSize={MAX_ASSET_SIZE}
						assetUrls={assetUrls}
						licenseKey={licenseKey}
						// Follow the OS theme like the rest of the app; a choice in tldraw's menu still wins.
						colorScheme="system"
					/>
				) : showHome ? (
					<Home
						boards={boards}
						pendingId={pendingId}
						error={error}
						onOpen={open}
						onCreate={createBoard}
					/>
				) : null}
			</main>
			{connectedIds.map((id) => (
				<BoardSync key={id} boardId={id} onReady={handleReady} onOffline={handleOffline} onError={handleError} />
			))}
		</div>
	)
}
