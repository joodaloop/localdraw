import type { BoardSummary } from '../shared/api'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface HomeProps {
	boards: BoardSummary[] | null
	pendingId: string | null
	error: string | null
	onOpen(boardId: string): void
	onCreate(): void
}

export function Home({ boards, pendingId, error, onOpen, onCreate }: HomeProps) {
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
