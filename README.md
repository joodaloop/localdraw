# Localdraw

A local-first desktop app for [tldraw](https://tldraw.dev) boards: a whiteboard you can depend on the way you depend on a text editor. Everything lives on your machine, works offline, and needs no account.

Development plan and ideas: [joodaloop.com/localdraw](https://joodaloop.com/localdraw/)

> **Status:** early and in active development. Expect rough edges, and keep backups of anything you care about.

## Features

- **A library of boards**: a home screen of all your boards; the app reopens the last one you used.
- **Fast switching**: recently used boards stay loaded, so opening them is instant, and each board reopens at the page and camera position you left it.
- **The full tldraw editor**: every drawing tool, pages, styles, export to PNG/SVG, embeds and link previews.
- **Media**: images, video, audio and PDFs (PDFs show as file cards for now). Files up to 500 MB, stored on disk, with seekable audio and video.
- **Private by default**: no network requests except the ones you cause (embeds, link previews, pasted image URLs), plus the tldraw SDK's license check in production builds.

## Getting started

Requires [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev
```

`pnpm dev` opens the app with hot reload for the UI. Changes to the main, preload and backend code rebuild and restart the app automatically.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development mode |
| `pnpm build` | Build a production bundle into `dist/` |
| `pnpm start` | Run the production bundle |
| `pnpm typecheck` | Type-check the project |

### Production builds and the tldraw license key

Development mode needs no license key. Production builds of anything using the tldraw SDK need one, or the editor stops rendering. Put your key in `.env.local` at the repo root (it's gitignored):

```sh
VITE_TLDRAW_LICENSE_KEY=tldraw-…
```

tldraw offers free trial and hobby (non-commercial) licenses at [tldraw.dev](https://tldraw.dev/get-a-license/plans). See [NOTICE.md](NOTICE.md) before distributing your own builds.

## How it works

Localdraw is an Electron app with three processes:

- **Renderer** (`src/renderer/`): React and the tldraw editor. A single editor store lives for the whole session and boards are swapped into it (`board-mirror.ts`), while a few recently used boards are kept connected in the background (`WarmBoard.tsx`).
- **Backend** (`src/backend/`): a utility process that owns the SQLite database (via the built-in `node:sqlite`) and runs a [tldraw sync](https://tldraw.dev/docs/sync) room per open board. The renderer talks to it over a `MessagePort`, so there's no local server or open port.
- **Main** (`src/main/`): windows, menus, and the `localdraw://` protocol, which serves the app and stored files (with range requests). It also fetches link previews.

Types and schemas shared between processes live in `src/shared/`.

### Where data lives

On macOS, in `~/Library/Application Support/localdraw/`:

- `localdraw.db`: the SQLite database. Each board's tldraw records are in their own `r_<id>_*` tables, managed by tldraw's `SQLiteSyncStorage`. The `boards`, `assets` and `sessions` tables are Localdraw's.
- `assets/`: uploaded files, named by their SHA-256 hash.

`pnpm dev` uses a separate folder, `localdraw-dev`, so development never touches the data of your built app, and both can run at once.

To back up the database while the app is running, use `sqlite3 localdraw.db "VACUUM INTO 'backup.db'"` rather than copying the file.

## License

Localdraw's own code is [MIT licensed](LICENSE). It is built on the tldraw SDK, which is **not** MIT licensed: it's used under the [tldraw license](licenses/tldraw-LICENSE.md). See [NOTICE.md](NOTICE.md) for what that means for building and distributing Localdraw.
