import { useEffect, useState } from 'react'

export type SyncState = { status: 'reconnecting' } | { status: 'failed'; reason: string }

// Quick drops (e.g. a backend restart) usually recover within this, so they stay silent.
const RECONNECTING_DELAY_MS = 2000

interface SyncStatusProps {
	/** The shown board's connection trouble, or null while it's saving normally. */
	state: SyncState | null
	onRetry(): void
}

/** Says when the shown board's edits aren't reaching the database. Shows nothing while all is well. */
export function SyncStatus({ state, onRetry }: SyncStatusProps) {
	const isReconnecting = state?.status === 'reconnecting'
	const [showReconnecting, setShowReconnecting] = useState(false)

	useEffect(() => {
		if (!isReconnecting) {
			setShowReconnecting(false)
			return
		}
		const timer = setTimeout(() => setShowReconnecting(true), RECONNECTING_DELAY_MS)
		return () => clearTimeout(timer)
	}, [isReconnecting])

	if (state?.status === 'failed') {
		return (
			<button
				type="button"
				className="sync-status"
				data-state="failed"
				title={`${state.reason}. Click to try again.`}
				onClick={onRetry}
			>
				Changes not saved
			</button>
		)
	}
	if (isReconnecting && showReconnecting) {
		return (
			<span className="sync-status" data-state="reconnecting" role="status">
				Reconnecting…
			</span>
		)
	}
	return null
}
