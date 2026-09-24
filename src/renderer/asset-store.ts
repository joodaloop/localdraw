import type { TLAssetStore } from 'tldraw'
import { ASSET_SRC_PREFIX, ASSET_URL_PREFIX } from '../shared/api'

/** Maps a stored `asset:<hash>` src to the URL the main process serves it at. Other srcs pass through. */
export function resolveAssetSrc(src: string | null): string | null {
	if (!src?.startsWith(ASSET_SRC_PREFIX)) return src
	return ASSET_URL_PREFIX + src.slice(ASSET_SRC_PREFIX.length)
}

/** Stores dropped/pasted files as files on disk (via the backend) instead of inlining base64 into records. */
export const assetStore: TLAssetStore = {
	async upload(_asset, file) {
		const { hash } = await window.localdraw.putAsset({
			name: file.name,
			mime: file.type,
			data: new Uint8Array(await file.arrayBuffer()),
		})
		return { src: ASSET_SRC_PREFIX + hash }
	},
	resolve(asset) {
		return resolveAssetSrc(asset.props.src)
	},
}
