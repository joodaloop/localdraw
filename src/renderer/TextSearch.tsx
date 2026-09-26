import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { atom, DefaultToolbar, EASINGS, Editor, track, useEditor, type TLShape, type TLUiOverrides } from 'tldraw'

export const showSearch = atom('showSearch', false)

export const searchOverrides: TLUiOverrides = {
	actions(_editor, actions) {
		return {
			...actions,
			'text-search': {
				id: 'text-search',
				label: 'Search',
				kbd: 'cmd+f,ctrl+f',
				onSelect() {
					showSearch.set(true)
				},
			},
		}
	},
}

interface SearchResult {
	text: string
	shape: TLShape
}

function getShapesWithText(editor: Editor, query: string): SearchResult[] {
	const needle = query.trim().toLowerCase()
	if (!needle) return []
	const results: SearchResult[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		const text = editor.getShapeUtil(shape).getText(shape)
		if (text?.toLowerCase().includes(needle)) results.push({ text, shape })
	}
	return results.sort((a, b) => a.text.localeCompare(b.text))
}

export function goToShape(editor: Editor, shape: TLShape) {
	const pageId = editor.getAncestorPageId(shape)
	if (!pageId) return
	if (editor.getCurrentPageId() !== pageId) editor.setCurrentPage(pageId)
	editor.setSelectedShapes([shape.id])
	editor.zoomToSelection({ animation: { duration: 300, easing: EASINGS.easeInOutCubic } })
}

/** Replaces tldraw's Toolbar slot with a cmd/ctrl+K-style search bar (via cmdk, same library as
 *  the board switcher) stacked above the default toolbar. Unlike that palette it's "upside down":
 *  results list on top, input on the bottom, so it reads naturally growing up from the toolbar. */
export const ToolbarWithSearch = track(function ToolbarWithSearch() {
	const editor = useEditor()
	const [query, setQuery] = useState('')
	const isVisible = showSearch.get()

	useEffect(() => {
		if (isVisible) setQuery('')
	}, [isVisible])

	// Escape closes the search regardless of what has focus (canvas, a shape, etc.), not just the panel.
	useEffect(() => {
		if (!isVisible) return
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') showSearch.set(false)
		}
		window.addEventListener('keydown', handleEscape)
		return () => window.removeEventListener('keydown', handleEscape)
	}, [isVisible])

	const results = getShapesWithText(editor, query)

	return (
		<div className="text-search">
			{isVisible && (
				<Command
					className="text-search-panel"
					label="Search board text"
					shouldFilter={false}
					onPointerDown={editor.markEventAsHandled}
				>
					{query && (
						<Command.List className="text-search-results">
							<Command.Empty className="text-search-empty">No matches</Command.Empty>
							{results.map((result) => (
								<Command.Item
									key={result.shape.id}
									value={result.shape.id}
									className="text-search-result"
									onSelect={() => goToShape(editor, result.shape)}
								>
									{result.text}
								</Command.Item>
							))}
						</Command.List>
					)}
					<Command.Input
						autoFocus
						value={query}
						onValueChange={setQuery}
						placeholder="Search text…"
						className="text-search-input"
					/>
				</Command>
			)}
			<DefaultToolbar />
		</div>
	)
})
