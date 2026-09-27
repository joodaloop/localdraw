import { BaseBoxShapeUtil, getColorValue, HTMLContainer, useEditor, useValue, type TLShapePartial } from 'tldraw'
import { DEFAULT_ICON_NAME, type TLIconShape, iconShapeProps } from '../../shared/icon-schema'
import { getTablerFilledIcon, getTablerIcon } from './tabler-registry'

// tldraw's own default shapes scale a base stroke width by size; icons follow the same steps.
const ICON_STROKE_WIDTH: Record<TLIconShape['props']['size'], number> = { s: 1, m: 1.5, l: 2, xl: 2.5 }

/** The icon's own native size (Tabler's viewBox is 24x24); double-clicking an edge snaps to it. */
export const NATIVE_SIZE = 24

function rotate(x: number, y: number, angle: number) {
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** A resizable box that renders one Tabler icon, styled by tldraw's color, size and fill style props. */
export class IconShapeUtil extends BaseBoxShapeUtil<TLIconShape> {
	static override type = 'icon' as const
	static override props = iconShapeProps

	override getDefaultProps(): TLIconShape['props'] {
		return { w: NATIVE_SIZE, h: NATIVE_SIZE, icon: DEFAULT_ICON_NAME, color: 'black', size: 'm', fill: 'none' }
	}

	override isAspectRatioLocked() {
		return true
	}

	component(shape: TLIconShape) {
		return <IconShapeComponent shape={shape} />
	}

	override getIndicatorPath(shape: TLIconShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	// Double-clicking a side (not a corner) resize handle snaps the shape back to the
	// icon's native 24px size, keeping its visual center fixed even if it's rotated.
	override onDoubleClickEdge(shape: TLIconShape): TLShapePartial<TLIconShape> | void {
		if (shape.props.w === NATIVE_SIZE && shape.props.h === NATIVE_SIZE) return
		const delta = rotate(shape.props.w / 2 - NATIVE_SIZE / 2, shape.props.h / 2 - NATIVE_SIZE / 2, shape.rotation)
		return {
			id: shape.id,
			type: shape.type,
			x: shape.x + delta.x,
			y: shape.y + delta.y,
			props: { w: NATIVE_SIZE, h: NATIVE_SIZE },
		}
	}
}

function IconShapeComponent({ shape }: { shape: TLIconShape }) {
	const editor = useEditor()
	const { color, fillColor } = useValue(
		'icon colors',
		() => {
			const colors = editor.getCurrentTheme().colors[editor.getColorMode()]
			const { color, fill } = shape.props
			// Match tldraw's shape-fill palette. Pattern fills use its flat fallback
			// shade because Tabler's filled artwork does not provide a hatch pattern.
			const fillColor = fill === 'none' ? 'transparent'
				: fill === 'semi' ? colors.solid
					: getColorValue(colors, color,
						fill === 'solid' || fill === 'pattern' ? 'semi'
							: fill === 'lined-fill' ? 'linedFill' : 'fill')
			return { color: getColorValue(colors, color, 'solid'), fillColor }
		},
		[editor, shape.props.color, shape.props.fill]
	)
	const wantsFilled = shape.props.fill !== 'none'
	// Tabler ships hand-drawn solid-fill artwork for a subset of icons (its own closed
	// paths, e.g. "IconHomeFilled"), not just the outline stroked as a filled region
	// (most outline paths are open line strokes, not closed shapes — filling those
	// directly would just look like broken scribbles). Icons without a filled
	// counterpart simply stay outline.
	const FilledIcon = wantsFilled ? getTablerFilledIcon(shape.props.icon) : undefined
	const Icon = getTablerIcon(shape.props.icon)
	const size = Math.min(shape.props.w, shape.props.h)

	return (
		<HTMLContainer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<div style={{ position: 'relative', width: size, height: size }}>
				{FilledIcon && (
					<div style={{ position: 'absolute', inset: 0 }}>
						<FilledIcon size={size} color={fillColor} />
					</div>
				)}
				{Icon && (
					<div style={{ position: 'absolute', inset: 0 }}>
						<Icon size={size} color={color} stroke={ICON_STROKE_WIDTH[shape.props.size]} />
					</div>
				)}
			</div>
		</HTMLContainer>
	)
}
