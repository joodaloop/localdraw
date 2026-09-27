import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { getTablerIcon, loadTablerTags, searchTablerIcons, tablerIconLabel } from './tabler-registry'

const CELL_SIZE = 56
const ROW_HEIGHT = 56
const OVERSCAN_ROWS = 3

interface IconGridProps {
	query: string
	onSelect(iconName: string): void
}

export interface IconGridHandle {
	/** Moves the focused cell by whole rows/columns, clamped to the current results. */
	move(dCol: number, dRow: number): void
	/** Activates the currently focused cell, as Enter would. */
	selectFocused(): void
}

/** A hand-rolled virtual scroller: with 5,000+ icons, only the rows near the
 *  viewport are ever mounted, no matter how many match the current search.
 *  Focus is tracked logically (not real DOM focus, which stays on the search
 *  input) so arrow keys can drive it from the command menu's own key handler. */
export const IconGrid = forwardRef<IconGridHandle, IconGridProps>(function IconGrid({ query, onSelect }, ref) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [containerWidth, setContainerWidth] = useState(0)
	const [containerHeight, setContainerHeight] = useState(0)
	const [scrollTop, setScrollTop] = useState(0)
	const [focusedIndex, setFocusedIndex] = useState(0)

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) => {
			setContainerWidth(entry.contentRect.width)
			setContainerHeight(entry.contentRect.height)
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	// Keyword tags load in the background; until they arrive, searches match names only.
	const [tagsLoaded, setTagsLoaded] = useState(false)
	useEffect(() => {
		let cancelled = false
		loadTablerTags().then(() => !cancelled && setTagsLoaded(true), console.error)
		return () => {
			cancelled = true
		}
	}, [])

	// Not recomputed on scroll or focus changes, only when the search (or the tags) change.
	const matches = useMemo(() => searchTablerIcons(query), [query, tagsLoaded])

	// A fresh search starts from the top, focused on the first result.
	useEffect(() => {
		setFocusedIndex(0)
		setScrollTop(0)
	}, [query])

	const columns = Math.max(1, Math.floor(containerWidth / CELL_SIZE))
	const totalRows = Math.ceil(matches.length / columns)
	const clampedFocus = Math.min(focusedIndex, Math.max(0, matches.length - 1))

	useImperativeHandle(
		ref,
		() => ({
			move(dCol, dRow) {
				if (matches.length === 0) return
				const row = Math.floor(clampedFocus / columns)
				const col = clampedFocus % columns
				const nextRow = Math.min(totalRows - 1, Math.max(0, row + dRow))
				const nextCol = Math.min(columns - 1, Math.max(0, col + dCol))
				const next = Math.min(matches.length - 1, nextRow * columns + nextCol)
				setFocusedIndex(next)

				// Keep the focused row inside the visible scroll window.
				const rowTop = nextRow * ROW_HEIGHT
				const rowBottom = rowTop + ROW_HEIGHT
				setScrollTop((top) => {
					if (rowTop < top) return rowTop
					if (rowBottom > top + containerHeight) return rowBottom - containerHeight
					return top
				})
			},
			selectFocused() {
				const name = matches[clampedFocus]
				if (name) onSelect(name)
			},
		}),
		[matches, columns, totalRows, clampedFocus, containerHeight, onSelect]
	)

	// The container is the source of truth for scrollTop once the user scrolls by hand;
	// re-sync it whenever `move` above adjusts it programmatically instead.
	useEffect(() => {
		containerRef.current?.scrollTo({ top: scrollTop })
	}, [scrollTop])

	const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
	const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN_ROWS)
	const visible = matches.slice(startRow * columns, endRow * columns)

	return (
		<div className="icon-grid" ref={containerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
			{matches.length === 0 ? (
				<div className="icon-grid-empty">No icons match “{query.trim()}”.</div>
			) : (
				<div className="icon-grid-spacer" style={{ height: totalRows * ROW_HEIGHT }}>
					<div
						className="icon-grid-rows"
						style={{ top: startRow * ROW_HEIGHT, gridTemplateColumns: `repeat(${columns}, ${CELL_SIZE}px)` }}
					>
						{visible.map((name, i) => {
							const index = startRow * columns + i
							const Icon = getTablerIcon(name)
							if (!Icon) return null
							return (
								<button
									key={name}
									type="button"
									className="icon-grid-cell"
									data-focused={index === clampedFocus || undefined}
									title={tablerIconLabel(name)}
									// Not onMouseEnter: that also fires when new results slide under a pointer
									// that hasn't moved, stealing focus from the first result on every keystroke.
									onMouseMove={(e) => {
										if (e.movementX !== 0 || e.movementY !== 0) setFocusedIndex(index)
									}}
									onClick={() => onSelect(name)}
								>
									<Icon size={22} stroke={1.75} />
								</button>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
})
