// The hidden window that renders board previews (see src/main/thumbnails.ts). Each
// board is loaded into a throwaway editor, exported as it looked from its saved
// camera, and the editor is thrown away again.

import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
	Box,
	createTLStore,
	defaultAddFontsFromNode,
	defaultBindingUtils,
	Editor,
	loadSnapshot,
	tipTapDefaultExtensions,
	type TLPageId,
	type TLSessionStateSnapshot,
	type TLStoreSnapshot,
} from 'tldraw'
import 'tldraw/tldraw.css'
import type {
	ThumbnailImages,
	ThumbnailRenderRequest,
	ThumbnailRenderResult,
	ThumbnailWorkerApi,
} from '../shared/api'
import { assetStore } from './asset-store'
import { allAssetUtils, allShapeUtils } from './media'

declare global {
	interface Window {
		thumbnailWorker: ThumbnailWorkerApi
	}
}

/** A 330px card at 2x. */
const THUMBNAIL_WIDTH = 660
/** Matches .board-preview's aspect-ratio in styles.css, so images fill cards without cropping. */
const THUMBNAIL_ASPECT = 16 / 10
const THUMBNAIL_MIME = 'image/webp'
/** Space around a whole page's content when there's no camera view to show, in page units. */
const PAGE_PADDING = 32

/** The largest card-shaped box centered in `box`, trimming its long side (like CSS `cover`). */
function cropToCard(box: Box): Box {
	const w = Math.min(box.w, box.h * THUMBNAIL_ASPECT)
	const h = w / THUMBNAIL_ASPECT
	return new Box(box.center.x - w / 2, box.center.y - h / 2, w, h)
}

/** The smallest card-shaped box centered on `box` that contains it (like CSS `contain`). */
function expandToCard(box: Box): Box {
	const w = Math.max(box.w, box.h * THUMBNAIL_ASPECT)
	const h = w / THUMBNAIL_ASPECT
	return new Box(box.center.x - w / 2, box.center.y - h / 2, w, h)
}

const assetUrls = getAssetUrlsByImport((url) => url)

async function render({ job, viewport }: ThumbnailRenderRequest): Promise<ThumbnailImages | null> {
	if (!job.document) return null

	const store = createTLStore({ assets: assetStore, shapeUtils: allShapeUtils, assetUtils: allAssetUtils })
	loadSnapshot(store, { document: job.document as TLStoreSnapshot })

	const container = document.createElement('div')
	container.classList.add('tl-container', 'tl-theme__light')
	document.body.appendChild(container)

	const editor = new Editor({
		store,
		shapeUtils: allShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: [],
		getContainer: () => container,
		licenseKey: import.meta.env.VITE_TLDRAW_LICENSE_KEY,
		fontAssetUrls: assetUrls.fonts,
		options: { text: { tipTapConfig: { extensions: tipTapDefaultExtensions }, addFontsFromNode: defaultAddFontsFromNode } },
	})

	try {
		const session = job.session as TLSessionStateSnapshot | null
		const pageId = session?.currentPageId as TLPageId | undefined
		if (pageId && editor.getPage(pageId)) editor.setCurrentPage(pageId)
		if (editor.getCurrentPageShapeIds().size === 0) return null

		// The page-space box the camera showed, as in the editor: screen point / zoom - camera.
		// Cropped to the card's shape around its center, so the preview keeps the saved zoom.
		const camera = session?.pageStates?.find((state) => state.pageId === editor.getCurrentPageId())?.camera
		let bounds = camera
			? cropToCard(new Box(-camera.x, -camera.y, viewport.w / camera.z, viewport.h / camera.z))
			: null
		// Only shapes in view: `bounds` alone crops the export but still renders every shape passed.
		let shapeIds = bounds ? [...editor.getShapeIdsInsideBounds(bounds)] : []

		// Nothing was in view (or there's no saved camera): show the whole page instead of a blank card.
		if (!bounds || shapeIds.length === 0) {
			const pageBounds = editor.getCurrentPageBounds()
			if (!pageBounds) return null
			bounds = expandToCard(pageBounds.clone().expandBy(PAGE_PADDING))
			shapeIds = [...editor.getCurrentPageShapeIds()]
		}

		const exportImage = async (darkMode: boolean) => {
			const { blob } = await editor.toImage(shapeIds, {
				format: 'webp',
				bounds,
				padding: 0,
				background: true,
				darkMode,
				scale: THUMBNAIL_WIDTH / bounds.w,
				pixelRatio: 1,
				quality: 0.8,
			})
			return new Uint8Array(await blob.arrayBuffer())
		}
		return { light: await exportImage(false), dark: await exportImage(true), mime: THUMBNAIL_MIME }
	} finally {
		editor.dispose()
		container.remove()
	}
}

window.thumbnailWorker.onRender(async (request) => {
	let result: ThumbnailRenderResult
	try {
		result = { requestId: request.requestId, ok: true, images: await render(request) }
	} catch (e) {
		result = { requestId: request.requestId, ok: false, error: e instanceof Error ? e.message : String(e) }
	}
	window.thumbnailWorker.sendResult(result)
})
