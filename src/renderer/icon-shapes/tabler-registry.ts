import * as TablerIcons from '@tabler/icons-react'
import type { ComponentType } from 'react'

export interface TablerIconProps {
	size?: number
	color?: string
	stroke?: number
}

const registry = TablerIcons as unknown as Record<string, ComponentType<TablerIconProps>>

/** Every outline icon's component name (e.g. "IconHome"), sorted. Filled variants are excluded. */
export const tablerIconNames: readonly string[] = Object.keys(registry)
	.filter((name) => name.startsWith('Icon') && !name.endsWith('Filled'))
	.sort()

export function getTablerIcon(name: string): ComponentType<TablerIconProps> | undefined {
	return registry[name]
}

/** The icon's solid-fill counterpart (its own closed-path artwork, not a background
 *  shape), e.g. "IconHome" -> "IconHomeFilled". Only a subset of icons have one. */
export function getTablerFilledIcon(name: string): ComponentType<TablerIconProps> | undefined {
	return registry[`${name}Filled`]
}

/** A search-friendly label: "IconLockAccess" -> "lock access". */
export function tablerIconLabel(name: string): string {
	return name
		.slice('Icon'.length)
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.toLowerCase()
}
