// Record schema for the icon shape: a resizable box that renders one Tabler icon,
// styled by tldraw's own color/size/fill style props (so the standard style panel just works).

import {
	DefaultColorStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	type RecordProps,
	type TLBaseShape,
	type TLDefaultColorStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

export interface IconShapeProps {
	w: number
	h: number
	/** A Tabler icon component name, e.g. "IconHome". */
	icon: string
	color: TLDefaultColorStyle
	size: TLDefaultSizeStyle
	fill: TLDefaultFillStyle
}

export const iconShapeProps: RecordProps<TLBaseShape<'icon', IconShapeProps>> = {
	w: T.nonZeroNumber,
	h: T.nonZeroNumber,
	icon: T.string,
	color: DefaultColorStyle,
	size: DefaultSizeStyle,
	fill: DefaultFillStyle,
}

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		icon: IconShapeProps
	}
}

export type TLIconShape = TLBaseShape<'icon', IconShapeProps>

/** The icon shown for a freshly-created icon shape. */
export const DEFAULT_ICON_NAME = 'IconPhoto'
