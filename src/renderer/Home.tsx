import { THUMBNAIL_URL_PREFIX, type BoardSummary, type TextSearchResult } from '../shared/api'
import { HomeSearch } from './HomeSearch'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
// numeric: 'auto' gives "today" and "yesterday" rather than "0 days ago" and "1 day ago".
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "today", "yesterday", "3 days ago": counted in calendar days, not 24-hour periods. */
function daysAgo(timestamp: number): string {
	const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
	// Rounded, since a day with a daylight-saving change isn't exactly 24 hours.
	const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(timestamp))) / 86_400_000)
	return relativeFormat.format(-days, 'day')
}

interface HomeProps {
	boards: BoardSummary[] | null
	pendingId: string | null
	error: string | null
	onOpen(boardId: string): void
	onOpenSearchResult(result: TextSearchResult): void
	onCreate(): void
}

export function Home({ boards, pendingId, error, onOpen, onOpenSearchResult, onCreate }: HomeProps) {
	return (
		<div className="home">
			<header className="home-header">
				<HomeSearch onOpen={onOpenSearchResult} />
				<button type="button" className="primary" onClick={() => onCreate()}>
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
							<span className="board-preview">
								{board.thumbnailVersion != null && (
									// Both modes are stored; the browser picks one and swaps it live when the system's changes.
									<picture>
										<source
											media="(prefers-color-scheme: dark)"
											srcSet={`${THUMBNAIL_URL_PREFIX}${board.id}/dark?v=${board.thumbnailVersion}`}
										/>
										<img
											src={`${THUMBNAIL_URL_PREFIX}${board.id}/light?v=${board.thumbnailVersion}`}
											alt=""
											loading="lazy"
											decoding="async"
										/>
									</picture>
								)}
							</span>
							<span className="board-meta">
								<span className="board-title">{board.title}</span>
								<span className="board-date" title={dateFormat.format(board.updatedAt)}>
									Last edited {daysAgo(board.updatedAt)}
								</span>
							</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	)
}
