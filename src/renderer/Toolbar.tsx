import { useState } from 'react'
import { MemoryMeter } from './MemoryMeter'
import { SyncStatus, type SyncState } from './SyncStatus'

interface Tab {
	id: string
	title: string
}

interface ToolbarProps {
	isHome: boolean
	tabs: Tab[]
	/** The tab currently shown in the editor, if any (none while home is showing). */
	activeTabId: string | null
	/** Connection trouble for the active tab, if any. */
	syncState: SyncState | null
	onRetrySync(): void
	onHome(): void
	onSelectTab(boardId: string): void
	onCloseTab(boardId: string): void
	onRenameTab(boardId: string, title: string): void
}

/** The app's title bar: spans the window and doubles as its drag handle. */
export function Toolbar({
	isHome,
	tabs,
	activeTabId,
	syncState,
	onRetrySync,
	onHome,
	onSelectTab,
	onCloseTab,
	onRenameTab,
}: ToolbarProps) {
	const [renamingId, setRenamingId] = useState<string | null>(null)

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
			<div className="tab-strip">
				{tabs.map((tab) => {
					const isActive = tab.id === activeTabId
					const isRenaming = renamingId === tab.id
					return (
						<div key={tab.id} className="tab" data-active={isActive || undefined} onClick={() => !isActive && onSelectTab(tab.id)}>
							{isRenaming ? (
								<input
									className="tab-title tab-title-input"
									aria-label="Board name"
									defaultValue={tab.title}
									maxLength={200}
									autoFocus
									onFocus={(e) => e.currentTarget.select()}
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => {
										if (e.key === 'Enter') e.currentTarget.blur()
										if (e.key === 'Escape') {
											e.currentTarget.value = tab.title
											e.currentTarget.blur()
										}
									}}
									onBlur={(e) => {
										setRenamingId(null)
										const next = e.currentTarget.value.trim()
										if (next && next !== tab.title) onRenameTab(tab.id, next)
									}}
								/>
							) : (
								<span className="tab-title" title="Double-click to rename" onDoubleClick={() => setRenamingId(tab.id)}>
									{tab.title}
								</span>
							)}
							<button
								type="button"
								className="tab-close"
								aria-label={`Close ${tab.title}`}
								onClick={(e) => {
									e.stopPropagation()
									onCloseTab(tab.id)
								}}
							>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
									<path d="M5 5l14 14M19 5 5 19" />
								</svg>
							</button>
						</div>
					)
				})}
			</div>
			<div className="toolbar-end">
				<SyncStatus state={syncState} onRetry={onRetrySync} />
				<MemoryMeter />
			</div>
		</header>
	)
}
