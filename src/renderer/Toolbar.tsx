interface ToolbarProps {
	isHome: boolean
	/** The name of the board being shown, if any. */
	title: string | null
	onHome(): void
}

/** The app's title bar: spans the window and doubles as its drag handle. */
export function Toolbar({ isHome, title, onHome }: ToolbarProps) {
	return (
		<header className="toolbar">
			<div className="toolbar-start">
				<button type="button" className="toolbar-home" aria-label="Home" aria-current={isHome || undefined} onClick={onHome}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M3 10.5 12 3l9 7.5" />
						<path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
					</svg>
				</button>
			</div>
			<div className="toolbar-title">{title}</div>
			<div className="toolbar-end" />
		</header>
	)
}
