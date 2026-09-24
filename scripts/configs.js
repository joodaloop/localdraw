// Vite configs for each Electron process. Everything, including node_modules,
// is bundled into dist/, so the packaged app ships no node_modules folder.

import react from '@vitejs/plugin-react'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = (...p) => path.join(root, 'src', ...p)
const dist = (...p) => path.join(root, 'dist', ...p)

const nodeExternals = ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]

// The CSP goes into production builds only: Vite's dev server needs inline
// scripts and a websocket for hot reload.
const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	// https: for bookmark preview images and favicons.
	"img-src 'self' data: blob: localdraw: https:",
	"media-src 'self' blob: localdraw:",
	"font-src 'self' data:",
	// cdn.tldraw.com: the tldraw SDK's license check ping (trial and watermarked licenses).
	"connect-src 'self' data: blob: localdraw: https://cdn.tldraw.com",
	// Embeds (YouTube, Figma, …). tldraw only creates them for its known providers.
	"frame-src https:",
	"object-src 'none'",
	"base-uri 'none'",
].join('; ')

/** @returns {import('vite').Plugin} */
function contentSecurityPolicy() {
	return {
		name: 'localdraw:csp',
		apply: 'build',
		transformIndexHtml: () => [
			{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
		],
	}
}

/** @returns {import('vite').InlineConfig} */
export function rendererConfig() {
	return {
		configFile: false,
		root: src('renderer'),
		// Read .env files (e.g. VITE_TLDRAW_LICENSE_KEY in .env.local) from the repo root.
		envDir: root,
		base: './',
		plugins: [react(), contentSecurityPolicy()],
		server: { port: 5173, strictPort: true },
		// Its `?url` asset imports only resolve when Vite serves the package directly.
		optimizeDeps: { exclude: ['@tldraw/assets'] },
		build: {
			outDir: dist('renderer'),
			emptyOutDir: true,
			target: 'chrome152', // Electron 44
		},
	}
}

/**
 * A single-file CommonJS bundle for a Node-side process (main, preload, backend).
 * @param {string} entry
 * @param {string} outDir
 * @returns {import('vite').InlineConfig}
 */
export function nodeConfig(entry, outDir, { watch = false } = {}) {
	return {
		configFile: false,
		root,
		logLevel: 'warn',
		build: {
			ssr: entry,
			outDir,
			emptyOutDir: false,
			target: 'node24', // Electron 44
			minify: false,
			sourcemap: true,
			watch: watch ? {} : null,
			rollupOptions: {
				external: nodeExternals,
				output: { format: 'cjs', entryFileNames: '[name].cjs', codeSplitting: false },
			},
		},
		ssr: { noExternal: true, external: ['electron'] },
	}
}

export const nodeBuilds = [
	[src('main', 'main.ts'), dist('main')],
	[src('backend', 'backend.ts'), dist('main')],
	[src('preload', 'preload.ts'), dist('preload')],
]

export { dist, root }
