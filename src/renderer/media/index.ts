import { defaultAssetUtils, defaultShapeUtils } from 'tldraw'
import { AudioAssetUtil, PdfAssetUtil } from './file-assets'
import { AudioShapeUtil, PdfShapeUtil } from './file-shapes'

/** Our additions to tldraw's shapes and assets. Pass to <Tldraw>, which merges them with its defaults. */
export const customShapeUtils = [PdfShapeUtil, AudioShapeUtil]
export const customAssetUtils = [PdfAssetUtil, AudioAssetUtil]

/** The complete lists, for stores (which, unlike <Tldraw>, don't add tldraw's defaults). */
export const allShapeUtils = [...defaultShapeUtils, ...customShapeUtils]
export const allAssetUtils = [...defaultAssetUtils, ...customAssetUtils]

/** Files up to this size can be dropped in; they're stored on disk, not in the database. */
export const MAX_ASSET_SIZE = 500 * 1024 * 1024
