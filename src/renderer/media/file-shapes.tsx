import {
	BaseBoxShapeUtil,
	createShapeId,
	HTMLContainer,
	useEditor,
	useIsEditing,
	useValue,
	type TLAsset,
	type TLShapePartial,
	type VecModel,
} from 'tldraw'
import { fileShapeProps, type FileShapeProps, type TLAudioShape, type TLPdfShape } from '../../shared/media-schema'
import { resolveAssetSrc } from '../asset-store'

const byteFormat = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })
const formatSize = (bytes: number) => byteFormat.format(bytes / (1024 * 1024))

function shapeForAsset(type: 'pdf' | 'audio', asset: TLAsset, position: VecModel, size: { w: number; h: number }) {
	return {
		id: createShapeId(),
		type,
		x: position.x,
		y: position.y,
		props: { assetId: asset.id, ...size },
	} satisfies TLShapePartial
}

function useFileAsset(assetId: FileShapeProps['assetId']) {
	const editor = useEditor()
	return useValue('file asset', () => (assetId ? editor.getAsset(assetId) : undefined), [editor, assetId])
}

function FileCard({ label, name, detail, children }: { label: string; name: string; detail: string; children?: React.ReactNode }) {
	return (
		<div className="file-card">
			<div className="file-card-row">
				<span className="file-card-badge">{label}</span>
				<div className="file-card-text">
					<div className="file-card-name">{name}</div>
					<div className="file-card-detail">{detail}</div>
				</div>
			</div>
			{children}
		</div>
	)
}

/** A PDF placeholder card; page rendering comes later. */
export class PdfShapeUtil extends BaseBoxShapeUtil<TLPdfShape> {
	static override type = 'pdf' as const
	static override props = fileShapeProps
	static override handledAssetTypes = ['pdf'] as const

	override getDefaultProps(): TLPdfShape['props'] {
		return { w: 280, h: 72, assetId: null }
	}

	override createShapeForAsset(asset: TLAsset, position: VecModel) {
		return shapeForAsset('pdf', asset, position, { w: 280, h: 72 })
	}

	component(shape: TLPdfShape) {
		return <PdfCard shape={shape} />
	}

	override getIndicatorPath(shape: TLPdfShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
		return path
	}
}

function PdfCard({ shape }: { shape: TLPdfShape }) {
	const asset = useFileAsset(shape.props.assetId)
	const props = asset?.type === 'pdf' ? asset.props : null
	return (
		<HTMLContainer>
			<FileCard label="PDF" name={props?.name || 'Missing file'} detail={props ? formatSize(props.fileSize) : ''} />
		</HTMLContainer>
	)
}

/** An audio player card. Double-click (edit) it to use the controls. */
export class AudioShapeUtil extends BaseBoxShapeUtil<TLAudioShape> {
	static override type = 'audio' as const
	static override props = fileShapeProps
	static override handledAssetTypes = ['audio'] as const

	override canEdit() {
		return true
	}

	override getDefaultProps(): TLAudioShape['props'] {
		return { w: 320, h: 112, assetId: null }
	}

	override createShapeForAsset(asset: TLAsset, position: VecModel) {
		return shapeForAsset('audio', asset, position, { w: 320, h: 112 })
	}

	component(shape: TLAudioShape) {
		return <AudioCard shape={shape} />
	}

	override getIndicatorPath(shape: TLAudioShape) {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
		return path
	}
}

function AudioCard({ shape }: { shape: TLAudioShape }) {
	const asset = useFileAsset(shape.props.assetId)
	const props = asset?.type === 'audio' ? asset.props : null
	const isEditing = useIsEditing(shape.id)
	const src = resolveAssetSrc(props?.src ?? null)
	return (
		<HTMLContainer>
			<FileCard label="Audio" name={props?.name || 'Missing file'} detail={props ? formatSize(props.fileSize) : ''}>
				{src && (
					<audio
						className="file-card-audio"
						controls
						preload="metadata"
						src={src}
						// Controls only take input while editing, so clicks elsewhere still select the shape.
						style={{ pointerEvents: isEditing ? 'all' : 'none' }}
					/>
				)}
			</FileCard>
		</HTMLContainer>
	)
}
