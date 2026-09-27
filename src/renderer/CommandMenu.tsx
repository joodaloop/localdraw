import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";
import type { BoardSummary } from "../shared/api";
import { FRAME_PRESET_GROUPS, type FramePreset } from "./frame-presets";
import { IconGrid, type IconGridHandle } from "./icon-shapes/IconGrid";

const NEW_BOARD_VALUE = "new-board";
const INSERT_ICON_VALUE = "insert-icon";
const INSERT_FRAME_VALUE = "insert-frame";
const FRAME_VALUE_PREFIX = "frame:";

type Page = "root" | "icons" | "frames";

/** A title like "2026-05-24 1:32PM" for boards made from the "New board" action. */
function timestampTitle(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hours = date.getHours();
  const time = `${hours % 12 || 12}:${pad(date.getMinutes())}${hours < 12 ? "AM" : "PM"}`;
  return `${day} ${time}`;
}

// Keyed by each preset's cmdk item value, so Enter can look up the highlighted one.
const FRAME_PRESETS_BY_VALUE = new Map<string, FramePreset>(
  FRAME_PRESET_GROUPS.flatMap(({ category, presets }) =>
    presets.map((preset) => [`${FRAME_VALUE_PREFIX}${category}/${preset.name}`, preset] as const),
  ),
);

interface CommandMenuProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  boards: BoardSummary[] | null;
  /** Enter opens in the current tab; Cmd/Ctrl+Enter opens in a new one. */
  onOpen(boardId: string, opts: { newTab: boolean }): void;
  onCreate(title: string, opts: { newTab: boolean }): void;
  /** Inserts a Tabler icon shape into the shown board; omitted while no board is open. */
  onInsertIcon?(iconName: string): void;
  /** Inserts a frame of the given preset size into the shown board; omitted while no board is open. */
  onInsertFrame?(preset: FramePreset): void;
}

/** Cmd/Ctrl+K palette: jump to a board by name, create a new timestamp-named board, (via
 *  "Insert icon…") drop into a searchable grid of every Tabler icon, or (via "Insert
 *  frame…") pick a Figma-style device/paper frame size. */
export function CommandMenu({
  open,
  onOpenChange,
  boards,
  onOpen,
  onCreate,
  onInsertIcon,
  onInsertFrame,
}: CommandMenuProps) {
  const [page, setPage] = useState<Page>("root");
  const [search, setSearch] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [frameQuery, setFrameQuery] = useState("");
  // The currently keyboard-highlighted item's value, kept controlled so our own
  // Enter/Cmd+Enter handling below knows what to act on.
  const [highlighted, setHighlighted] = useState("");
  // The icon grid isn't made of Command.Items (see IconGrid's own comment), so its
  // arrow-key/Enter handling is driven from here instead of cmdk's own item registry.
  const iconGridRef = useRef<IconGridHandle>(null);

  // Reset every page's state once the palette closes, so it starts fresh next time.
  useEffect(() => {
    if (!open) {
      setPage("root");
      setSearch("");
      setIconQuery("");
      setFrameQuery("");
    }
  }, [open]);

  // Filtered by hand (shouldFilter={false} below): cmdk's own filtering reorders
  // [cmdk-item] DOM nodes directly on every keystroke, which assumes every item is
  // either a direct child of the list or inside a Command.Group, and has crashed the
  // whole page when that didn't hold.
  const query = search.trim().toLowerCase();
  const filteredBoards = (boards ?? []).filter((board) =>
    board.title.toLowerCase().includes(query),
  );
  const actions = [
    { value: NEW_BOARD_VALUE, label: "Create a new board" },
    ...(onInsertIcon ? [{ value: INSERT_ICON_VALUE, label: "Insert icon…" }] : []),
    ...(onInsertFrame ? [{ value: INSERT_FRAME_VALUE, label: "Insert frame…" }] : []),
  ];
  const filteredActions = actions.filter((action) => action.label.toLowerCase().includes(query));

  const frameTerm = frameQuery.trim().toLowerCase();
  const filteredFrameGroups = FRAME_PRESET_GROUPS.map(({ category, presets }) => ({
    category,
    presets: category.toLowerCase().includes(frameTerm)
      ? presets
      : presets.filter((preset) => preset.name.toLowerCase().includes(frameTerm)),
  })).filter((group) => group.presets.length > 0);

  function select(value: string, newTab: boolean) {
    if (value === INSERT_ICON_VALUE) {
      setPage("icons");
    } else if (value === INSERT_FRAME_VALUE) {
      setPage("frames");
    } else if (value.startsWith(FRAME_VALUE_PREFIX)) {
      const preset = FRAME_PRESETS_BY_VALUE.get(value);
      if (!preset) return;
      onOpenChange(false);
      onInsertFrame?.(preset);
    } else if (value === NEW_BOARD_VALUE) {
      onOpenChange(false);
      onCreate(timestampTitle(), { newTab });
    } else {
      onOpenChange(false);
      onOpen(value, { newTab });
    }
  }

  function selectIcon(iconName: string) {
    onOpenChange(false);
    onInsertIcon?.(iconName);
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
        if (e.key === "Escape" && page !== "root") {
          e.preventDefault();
          setPage("root");
          return;
        }
        if (page === "icons") {
          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              iconGridRef.current?.move(0, 1);
              return;
            case "ArrowUp":
              e.preventDefault();
              iconGridRef.current?.move(0, -1);
              return;
            case "ArrowRight":
              e.preventDefault();
              iconGridRef.current?.move(1, 0);
              return;
            case "ArrowLeft":
              e.preventDefault();
              iconGridRef.current?.move(-1, 0);
              return;
            case "Enter":
              e.preventDefault();
              iconGridRef.current?.selectFocused();
              return;
            default:
              return;
          }
        }
        if (e.key !== "Enter") return;
        // Handled entirely by hand (and not cmdk's own Enter-selects-item dispatch,
        // which carries no modifier-key info) so Cmd/Ctrl+Enter can open a new tab.
        e.preventDefault();
        if (highlighted) select(highlighted, e.metaKey || e.ctrlKey);
      }}
    >
      {page === "root" ? (
        <>
          <Command.Input
            autoFocus
            placeholder="Search boards and actions…"
            value={search}
            onValueChange={setSearch}
          />
          <Command.List>
            {filteredBoards.length > 0 && (
              <Command.Group heading="Boards">
                {filteredBoards.map((board) => (
                  <Command.Item
                    key={board.id}
                    value={board.id}
                    onSelect={() => select(board.id, false)}
                  >
                    {board.title}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {filteredActions.length > 0 && (
              <Command.Group heading="Actions">
                {filteredActions.map((action) => (
                  <Command.Item
                    key={action.value}
                    value={action.value}
                    onSelect={() => select(action.value, false)}
                  >
                    {action.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Empty>No matching boards or actions</Command.Empty>
          </Command.List>
        </>
      ) : page === "frames" ? (
        <>
          <Command.Input
            autoFocus
            placeholder="Search frame sizes…"
            value={frameQuery}
            onValueChange={setFrameQuery}
          />
          <Command.List>
            {filteredFrameGroups.map(({ category, presets }) => (
              <Command.Group key={category} heading={category}>
                {presets.map((preset) => {
                  const value = `${FRAME_VALUE_PREFIX}${category}/${preset.name}`;
                  return (
                    <Command.Item key={value} value={value} onSelect={() => select(value, false)}>
                      <span>{preset.name}</span>
                      <span className="command-menu-hint">
                        {preset.w}×{preset.h}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
            <Command.Empty>No matching frame sizes</Command.Empty>
          </Command.List>
        </>
      ) : (
        <>
          <Command.Input
            autoFocus
            placeholder="Search icons…"
            value={iconQuery}
            onValueChange={setIconQuery}
          />
          <IconGrid ref={iconGridRef} query={iconQuery} onSelect={selectIcon} />
        </>
      )}
    </Command.Dialog>
  );
}
