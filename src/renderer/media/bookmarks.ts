import { AssetRecordType, getHashForString, type Editor, type TLBookmarkAsset } from 'tldraw'

/**
 * Replaces tldraw's bookmark handler, which fetches pages from the renderer (and
 * so fails on CORS and our CSP), with one that asks the main process instead.
 */
export function registerBookmarkHandler(editor: Editor) {
	editor.registerExternalAssetHandler('url', async ({ url }): Promise<TLBookmarkAsset> => {
		const preview = await window.localdraw.unfurl(url).catch((error) => {
			console.warn(`Couldn't load a preview for ${url}`, error)
			return { title: url, description: '', image: '', favicon: '' }
		})
		return {
			id: AssetRecordType.createId(getHashForString(url)),
			typeName: 'asset',
			type: 'bookmark',
			props: { src: url, ...preview },
			meta: {},
		}
	})
}
