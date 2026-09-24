import { useRef } from 'react'
import type { BoardSummary } from '../shared/api'

// Long enough to skip boards the pointer merely passes over.
const HOVER_WARM_DELAY_MS = 100

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface HomeProps {
	boards: BoardSummary[] | null
	pendingId: string | null
	error: string | null
	onOpen(boardId: string): void
	onWarm(boardId: string): void
	onCreate(): void
}

export function Home({ boards, pendingId, error, onOpen, onWarm, onCreate }: HomeProps) {
	const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

	return (
		<div className="home">
			<header className="home-header">
				<h1>Boards</h1>
				<button type="button" className="primary" onClick={onCreate}>
					New board
				</button>
			</header>

			{error && <p className="home-error">{error}</p>}
			{boards?.length === 0 && <p className="home-empty">No boards yet.</p>}

			<ul className="board-grid">
				{boards?.map((board) => (
					<li key={board.id}>
						<button
							type="button"
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
							<span className="board-date">Edited {dateFormat.format(board.updatedAt)}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	)
}
