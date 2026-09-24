import {
	createSessionStateSnapshotSignal,
	react,
	type TLSessionStateSnapshot,
	type TLStore,
} from 'tldraw'

const SAVE_DELAY_MS = 1000

// The latest known view state (page, camera, selection) of each board: loaded
// from the backend when a board warms up, then kept current while it's shown.
const latest = new Map<string, TLSessionStateSnapshot>()

export async function preloadSession(boardId: string) {
	if (latest.has(boardId)) return
	const saved = await window.localdraw.getSession(boardId)
	if (saved && !latest.has(boardId)) latest.set(boardId, saved as TLSessionStateSnapshot)
}

export function getSavedSession(boardId: string): TLSessionStateSnapshot | undefined {
	return latest.get(boardId)
}

/**
 * Saves the board's view state (debounced) while it's shown in `store`. Stop it
 * before the store's contents change; the returned function flushes.
 */
export function trackSession(boardId: string, store: TLStore): () => void {
	const $session = createSessionStateSnapshotSignal(store)
	let timer: ReturnType<typeof setTimeout> | undefined

	const save = () => {
		clearTimeout(timer)
		timer = undefined
		const snapshot = latest.get(boardId)
		if (snapshot) window.localdraw.saveSession(boardId, snapshot).catch(console.error)
	}

	const stop = react('track board session', () => {
		const snapshot = $session.get()
		if (!snapshot) return
		latest.set(boardId, snapshot)
		clearTimeout(timer)
		timer = setTimeout(save, SAVE_DELAY_MS)
	})

	return () => {
		stop()
		if (timer !== undefined) save()
	}
}
