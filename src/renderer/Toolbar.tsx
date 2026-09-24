interface ToolbarProps {
	title: string | null
	onCreate(): void
}

/** The app's title bar: spans the window and doubles as its drag handle. */
export function Toolbar({ title, onCreate }: ToolbarProps) {
	return (
		<header className="toolbar">
			<div className="toolbar-start">
				<button type="button" className="primary" onClick={onCreate}>
					New board
				</button>
			</div>
			<div className="toolbar-title">{title}</div>
			<div className="toolbar-end" />
		</header>
	)
}
