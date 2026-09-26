import { Command } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import type { BoardSummary } from '../shared/api'
import { IconGrid, type IconGridHandle } from './icons/IconGrid'

const CREATE_VALUE = 'create'
const INSERT_ICON_VALUE = 'insert-icon'

type Page = 'root' | 'icons'

interface CommandMenuProps {
	open: boolean
	onOpenChange(open: boolean): void
	boards: BoardSummary[] | null
	/** Enter opens in the current tab; Cmd/Ctrl+Enter opens in a new one. */
	onOpen(boardId: string, opts: { newTab: boolean }): void
	onCreate(title: string, opts: { newTab: boolean }): void
	/** Inserts a Tabler icon shape into the shown board; omitted while no board is open. */
	onInsertIcon?(iconName: string): void
}

/** Cmd/Ctrl+K palette: jump to a board by name, create one if nothing matches, or (via
 *  "Insert Icon…") drop into a searchable grid of every Tabler icon. */
export function CommandMenu({ open, onOpenChange, boards, onOpen, onCreate, onInsertIcon }: CommandMenuProps) {
	const [page, setPage] = useState<Page>('root')
	const [search, setSearch] = useState('')
	const [iconQuery, setIconQuery] = useState('')
	// The currently keyboard-highlighted item's value, kept controlled so our own
	// Enter/Cmd+Enter handling below knows what to act on.
	const [highlighted, setHighlighted] = useState('')
	// The icon grid isn't made of Command.Items (see IconGrid's own comment), so its
	// arrow-key/Enter handling is driven from here instead of cmdk's own item registry.
	const iconGridRef = useRef<IconGridHandle>(null)

	// Reset both pages' state once the palette closes, so it starts fresh next time.
	useEffect(() => {
		if (!open) {
			setPage('root')
			setSearch('')
			setIconQuery('')
		}
	}, [open])

	// Filtered by hand (shouldFilter={false} below): cmdk's own filtering reorders
	// [cmdk-item] DOM nodes directly on every keystroke, which assumes every item is
	// either a direct child of the list or inside a Command.Group. The "create board"
	// item lived inside Command.Empty instead, so once it mounted, cmdk's reorder step
	// couldn't find a place to move it and crashed the whole page.
	const query = search.trim().toLowerCase()
	const filteredBoards = (boards ?? []).filter((board) => board.title.toLowerCase().includes(query))
	const showCreate = filteredBoards.length === 0 && search.trim().length > 0

	function select(value: string, newTab: boolean) {
		if (value === INSERT_ICON_VALUE) {
			setPage('icons')
		} else if (value === CREATE_VALUE) {
			const title = search.trim()
			if (!title) return
			onOpenChange(false)
			onCreate(title, { newTab })
		} else {
			onOpenChange(false)
			onOpen(value, { newTab })
		}
	}

	function selectIcon(iconName: string) {
		onOpenChange(false)
		onInsertIcon?.(iconName)
	}

	return (
		<Command.Dialog
			open={open}
			onOpenChange={onOpenChange}
			label="Command menu"
			shouldFilter={false}
			value={highlighted}
			onValueChange={setHighlighted}
			className="command-menu"
			overlayClassName="command-menu-overlay"
			contentClassName="command-menu-content"
			onKeyDown={(e) => {
				if (e.key === 'Escape' && page !== 'root') {
					e.preventDefault()
					setPage('root')
					return
				}
				if (page === 'icons') {
					switch (e.key) {
						case 'ArrowDown':
							e.preventDefault()
							iconGridRef.current?.move(0, 1)
							return
						case 'ArrowUp':
							e.preventDefault()
							iconGridRef.current?.move(0, -1)
							return
						case 'ArrowRight':
							e.preventDefault()
							iconGridRef.current?.move(1, 0)
							return
						case 'ArrowLeft':
							e.preventDefault()
							iconGridRef.current?.move(-1, 0)
							return
						case 'Enter':
							e.preventDefault()
							iconGridRef.current?.selectFocused()
							return
						default:
							return
					}
				}
				if (e.key !== 'Enter') return
				// Handled entirely by hand (and not cmdk's own Enter-selects-item dispatch,
				// which carries no modifier-key info) so Cmd/Ctrl+Enter can open a new tab.
				e.preventDefault()
				if (highlighted) select(highlighted, e.metaKey || e.ctrlKey)
			}}
		>
			{page === 'root' ? (
				<>
					<Command.Input autoFocus placeholder="Search boards…" value={search} onValueChange={setSearch} />
					<Command.List>
						{filteredBoards.map((board) => (
							<Command.Item key={board.id} value={board.id} onSelect={() => select(board.id, false)}>
								{board.title}
							</Command.Item>
						))}
						{showCreate && (
							<Command.Item value={CREATE_VALUE} onSelect={() => select(CREATE_VALUE, false)}>
								Create board “{search.trim()}”
							</Command.Item>
						)}
						{onInsertIcon && (
							<Command.Item value={INSERT_ICON_VALUE} onSelect={() => select(INSERT_ICON_VALUE, false)}>
								Insert icon…
							</Command.Item>
						)}
					</Command.List>
				</>
			) : (
				<>
					<Command.Input autoFocus placeholder="Search icons…" value={iconQuery} onValueChange={setIconQuery} />
					<IconGrid ref={iconGridRef} query={iconQuery} onSelect={selectIcon} />
				</>
			)}
		</Command.Dialog>
	)
}
