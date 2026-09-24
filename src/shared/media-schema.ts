// Record schemas for the file types tldraw doesn't support natively. Shared by
// the renderer (shape/asset utils) and the backend (sync room schema), since
// the room rejects records whose types it doesn't know.

import {
	assetIdValidator,
	createTLSchema,
	defaultAssetSchemas,
	defaultShapeSchemas,
	type RecordProps,
	type TLAssetId,
	type TLBaseAsset,
	type TLBaseShape,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

export const PDF_MIME_TYPES = ['application/pdf'] as const

export const AUDIO_MIME_TYPES = [
	'audio/mpeg',
	'audio/mp4',
	'audio/x-m4a',
	'audio/aac',
	'audio/wav',
	'audio/x-wav',
	'audio/wave',
	'audio/ogg',
	'audio/webm',
	'audio/flac',
	'audio/x-flac',
] as const

/** Props for assets that are just a stored file (no dimensions). */
export interface FileAssetProps {
	name: string
	src: string | null
	mimeType: string | null
	fileSize: number
}

export const fileAssetProps: RecordProps<TLBaseAsset<string, FileAssetProps>> = {
	name: T.string,
	src: T.srcUrl.nullable(),
	mimeType: T.string.nullable(),
	fileSize: T.nonZeroInteger,
}

/** Props for box shapes that display one file asset. */
export interface FileShapeProps {
	w: number
	h: number
	assetId: TLAssetId | null
}

export const fileShapeProps: RecordProps<TLBaseShape<string, FileShapeProps>> = {
	w: T.nonZeroNumber,
	h: T.nonZeroNumber,
	assetId: assetIdValidator.nullable(),
}

declare module '@tldraw/tlschema' {
	interface TLGlobalAssetPropsMap {
		pdf: FileAssetProps
		audio: FileAssetProps
	}
	interface TLGlobalShapePropsMap {
		pdf: FileShapeProps
		audio: FileShapeProps
	}
}

export type TLPdfAsset = TLBaseAsset<'pdf', FileAssetProps>
export type TLAudioAsset = TLBaseAsset<'audio', FileAssetProps>
export type TLPdfShape = TLBaseShape<'pdf', FileShapeProps>
export type TLAudioShape = TLBaseShape<'audio', FileShapeProps>

/** The full record schema of a Localdraw board: tldraw's defaults plus our file types. */
export function createLocaldrawSchema() {
	return createTLSchema({
		shapes: { ...defaultShapeSchemas, pdf: { props: fileShapeProps }, audio: { props: fileShapeProps } },
		assets: { ...defaultAssetSchemas, pdf: { props: fileAssetProps }, audio: { props: fileAssetProps } },
	})
}
