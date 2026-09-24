import { loadSnapshot, type Editor, type TLSessionStateSnapshot, type TLStore } from 'tldraw'

/**
 * Keeps the editor's store and one board's synced store in step, so a single
 * long-lived editor can show any board:
 *
 * - edits made in the editor are applied to the board store as local changes,
 *   which its sync client then sends to the backend
 * - changes arriving from the backend are applied to the editor as remote changes
 *
 * Each side only listens to the other side's origin, so nothing echoes back.
 */
function mirror(editorStore: TLStore, boardStore: TLStore): () => void {
	const stopUp = editorStore.listen(({ changes }) => boardStore.applyDiff(changes), {
		source: 'user',
		scope: 'document',
	})
	const stopDown = boardStore.listen(
		({ changes }) => editorStore.mergeRemoteChanges(() => editorStore.applyDiff(changes)),
		{ source: 'remote', scope: 'document' }
	)
	return () => {
		// Listeners are batched per frame: deliver anything still pending to this board first.
		editorStore._flushHistory()
		boardStore._flushHistory()
		stopUp()
		stopDown()
	}
}

let detachCurrent: (() => void) | null = null

/**
 * Replaces the editor's contents with a board's, in place: the editor and its UI
 * stay mounted. Pass `editor` once it exists; before that only the store is filled.
 */
export function showBoard(
	editorStore: TLStore,
	editor: Editor | null,
	boardStore: TLStore,
	session: TLSessionStateSnapshot | undefined
) {
	// Detach first, or the swap itself would be mirrored into the old board as edits.
	detachCurrent?.()
	detachCurrent = null

	if (editor) {
		// Leave any in-progress interaction (drag, text editing) before its shapes disappear.
		editor.cancel()
		editor.setCurrentTool('select')
	}

	loadSnapshot(
		editorStore,
		{ document: boardStore.getStoreSnapshot('document'), session },
		{ forceOverwriteSessionState: true }
	)

	if (editor) {
		// Boards never seen before would otherwise inherit the previous board's camera.
		if (!session) editor.setCamera({ x: 0, y: 0, z: 1 }, { immediate: true })
		// Undo must not reach back into the previous board.
		editor.clearHistory()
	}

	// Drop the swap's own changes before the new mirror starts listening.
	editorStore._flushHistory()
	detachCurrent = mirror(editorStore, boardStore)
}
