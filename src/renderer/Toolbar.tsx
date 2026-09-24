import { useEffect, useState } from 'react'
import { MemoryMeter } from './MemoryMeter'

interface ToolbarProps {
	isHome: boolean
	/** The name of the board being shown, if any. */
	title: string | null
	onHome(): void
	onRename(title: string): void
}

/** The app's title bar: spans the window and doubles as its drag handle. */
export function Toolbar({ isHome, title, onHome, onRename }: ToolbarProps) {
	const [isRenaming, setIsRenaming] = useState(false)
	// Leaving the board mid-edit (e.g. going home) unmounts the input without a blur: drop the edit.
	useEffect(() => {
		if (title === null) setIsRenaming(false)
	}, [title])

	return (
		<header className="toolbar">
			<div className="toolbar-start">
				<button type="button" className="toolbar-home" aria-label="Home" title="Home (⇧⌘H)" aria-current={isHome || undefined} onClick={onHome}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M3 10.5 12 3l9 7.5" />
						<path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
					</svg>
				</button>
			</div>
			{title !== null && isRenaming ? (
				<input
					className="toolbar-title toolbar-title-input"
					aria-label="Board name"
					defaultValue={title}
					maxLength={200}
					autoFocus
					onFocus={(e) => e.currentTarget.select()}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur()
						if (e.key === 'Escape') {
							// Discard the edit: restore the old name before blur saves it.
							e.currentTarget.value = title
							e.currentTarget.blur()
						}
					}}
					onBlur={(e) => {
						setIsRenaming(false)
						const next = e.currentTarget.value.trim()
						if (next && next !== title) onRename(next)
					}}
				/>
			) : (
				<div className="toolbar-title" title="Double-click to rename" onDoubleClick={() => title !== null && setIsRenaming(true)}>
					{title}
				</div>
			)}
			<div className="toolbar-end">
				<MemoryMeter />
			</div>
		</header>
	)
}
