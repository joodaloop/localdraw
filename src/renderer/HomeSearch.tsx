import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import type { TextSearchResult } from '../shared/api'

interface HomeSearchProps {
	onOpen(result: TextSearchResult): void
}

/** Searches shape text across every board via the backend's FTS5 index (see backend.ts). */
export function HomeSearch({ onOpen }: HomeSearchProps) {
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<TextSearchResult[]>([])
	// The dropdown is separate from the query text: it hides on blur/click-outside
	// (like any combobox) without discarding what's typed, and reappears on refocus.
	const [isFocused, setIsFocused] = useState(false)

	useEffect(() => {
		const trimmed = query.trim()
		if (!trimmed) {
			setResults([])
			return
		}
		let cancelled = false
		// No debounce: the trigram FTS query resolves in low single-digit milliseconds
		// even at a generous scale, so there's nothing to batch.
		window.localdraw.searchText(trimmed).then((found) => {
			if (!cancelled) setResults(found)
		}, console.error)
		return () => {
			cancelled = true
		}
	}, [query])

	return (
		<Command className="home-search" label="Search board text" shouldFilter={false}>
			<Command.Input
				value={query}
				onValueChange={setQuery}
				placeholder="Search text across all boards…"
				className="home-search-input"
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						if (query) setQuery('')
						else e.currentTarget.blur()
					}
				}}
			/>
			{query.trim() && isFocused && (
				// Prevents the input from blurring (and the dropdown from disappearing
				// out from under the click) when a result is clicked.
				<Command.List className="home-search-results" onMouseDown={(e) => e.preventDefault()}>
					<Command.Empty className="home-search-empty">No matches</Command.Empty>
					{results.map((result) => (
						<Command.Item
							key={`${result.boardId}:${result.shapeId}`}
							value={`${result.boardId}:${result.shapeId}`}
							className="home-search-result"
							onSelect={() => onOpen(result)}
						>
							<span className="home-search-text">{result.text}</span>
							<span className="home-search-board">{result.boardTitle}</span>
						</Command.Item>
					))}
				</Command.List>
			)}
		</Command>
	)
}
