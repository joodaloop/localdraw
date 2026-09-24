/// <reference types="vite/client" />

import type { LocaldrawApi } from '../shared/api'

declare global {
	interface Window {
		localdraw: LocaldrawApi
	}

	interface ImportMetaEnv {
		readonly VITE_TLDRAW_LICENSE_KEY?: string
	}
}
