import { useRef } from 'react'
import type { BoardSummary } from '../shared/api'

// Long enough to skip boards the pointer merely passes over.
const HOVER_WARM_DELAY_MS = 100

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface SidebarProps {
	boards: BoardSummary[] | null
	activeId: string | null
	pendingId: string | null
	error: string | null
	onOpen(boardId: string): void
	onWarm(boardId: string): void
}

export function Sidebar({ boards, activeId, pendingId, error, onOpen, onWarm }: SidebarProps) {
	const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

	return (
		<nav className="sidebar" aria-label="Boards">
			<ul className="board-list">
				{boards?.map((board) => (
					<li key={board.id}>
						<button
							type="button"
							aria-current={board.id === activeId ? 'page' : undefined}
							data-pending={board.id === pendingId || undefined}
							onClick={() => onOpen(board.id)}
							onFocus={() => onWarm(board.id)}
							onPointerEnter={() => {
								clearTimeout(hoverTimer.current)
								hoverTimer.current = setTimeout(() => onWarm(board.id), HOVER_WARM_DELAY_MS)
							}}
							onPointerLeave={() => clearTimeout(hoverTimer.current)}
						>
							<span className="board-title">{board.title}</span>
							<span className="board-date">{dateFormat.format(board.createdAt)}</span>
						</button>
					</li>
				))}
			</ul>

			{error && <p className="sidebar-error">{error}</p>}
		</nav>
	)
}
