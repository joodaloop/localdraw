// Where stored files live on disk. Node-only (main and backend).

import path from 'node:path'

const HASH_RE = /^[0-9a-f]{64}$/

export function isAssetHash(value: unknown): value is string {
	return typeof value === 'string' && HASH_RE.test(value)
}

/** Files are content-addressed and fanned out by hash prefix: `<dir>/ab/abcdef…`. */
export function assetFilePath(assetsDir: string, hash: string) {
	return path.join(assetsDir, hash.slice(0, 2), hash)
}
