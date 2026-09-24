import { AssetUtil, type TLAssetId } from 'tldraw'
import {
	AUDIO_MIME_TYPES,
	fileAssetProps,
	PDF_MIME_TYPES,
	type FileAssetProps,
	type TLAudioAsset,
	type TLPdfAsset,
} from '../../shared/media-schema'

const defaultFileAssetProps = (): FileAssetProps => ({ name: '', src: null, mimeType: null, fileSize: 1 })

function assetFromFile<T extends 'pdf' | 'audio'>(type: T, file: File, id: TLAssetId) {
	return {
		id,
		type,
		typeName: 'asset' as const,
		// `src` is filled in by tldraw once our asset store has uploaded the file.
		props: { name: file.name, src: '', mimeType: file.type || null, fileSize: Math.max(1, file.size) },
		meta: {},
	}
}

export class PdfAssetUtil extends AssetUtil<TLPdfAsset> {
	static override type = 'pdf' as const
	static override props = fileAssetProps

	override getDefaultProps() {
		return defaultFileAssetProps()
	}

	override getSupportedMimeTypes() {
		return PDF_MIME_TYPES
	}

	override async getAssetFromFile(file: File, assetId: TLAssetId): Promise<TLPdfAsset> {
		return assetFromFile('pdf', file, assetId)
	}
}

export class AudioAssetUtil extends AssetUtil<TLAudioAsset> {
	static override type = 'audio' as const
	static override props = fileAssetProps

	override getDefaultProps() {
		return defaultFileAssetProps()
	}

	override getSupportedMimeTypes() {
		return AUDIO_MIME_TYPES
	}

	override async getAssetFromFile(file: File, assetId: TLAssetId): Promise<TLAudioAsset> {
		return assetFromFile('audio', file, assetId)
	}
}
