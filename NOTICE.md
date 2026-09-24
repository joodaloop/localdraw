# Notices

Localdraw's own source code (everything in this repository except `licenses/`)
is released under the MIT License; see [LICENSE](LICENSE).

Localdraw is built on the [tldraw SDK](https://tldraw.dev), which is **not** MIT
licensed. The tldraw SDK (the `tldraw` and `@tldraw/*` packages) is copyrighted
by tldraw, Inc. and is used under the tldraw license, a copy of which is in
[licenses/tldraw-LICENSE.md](licenses/tldraw-LICENSE.md) (for tldraw v5.4.2).

What this means in practice:

- **Working on Localdraw** (`pnpm dev`) needs no tldraw license key.
- **Production builds** need a tldraw license key, supplied at build time as
  `VITE_TLDRAW_LICENSE_KEY` (e.g. in `.env.local`, which is not committed).
  Official Localdraw releases use the maintainer's own key.
- **If you distribute your own builds** of Localdraw, you need your own tldraw
  license (tldraw offers free hobby licenses for non-commercial projects) and
  must comply with its terms, including shipping a copy of the tldraw license
  with your build. `pnpm build` copies the files in `licenses/` into `dist/`
  for that reason.

Other bundled dependencies (React, etc.) are under their own permissive
licenses, found in their packages in `node_modules`.
