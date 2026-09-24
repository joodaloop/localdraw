import { net } from 'electron'
import type { LinkPreview } from '../shared/api'

const TIMEOUT_MS = 8000
// Metadata lives in <head>; no need to download whole pages.
const MAX_HTML_BYTES = 512 * 1024

/** Fetches a page and reads its title, description and preview images from the HTML head. */
export async function unfurl(pageUrl: string): Promise<LinkPreview> {
	const url = new URL(pageUrl)
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) links can be previewed')

	const response = await net.fetch(url.href, {
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { accept: 'text/html,application/xhtml+xml' },
	})
	if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
	if (!response.headers.get('content-type')?.includes('html')) {
		return { title: url.href, description: '', image: '', favicon: '' }
	}

	const html = await readText(response, MAX_HTML_BYTES)
	const base = response.url || url.href
	const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttributes(m[0]))
	const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => parseAttributes(m[0]))

	const meta = (...keys: string[]) => {
		for (const key of keys) {
			const tag = metas.find((attrs) => attrs.property === key || attrs.name === key)
			if (tag?.content) return tag.content
		}
		return ''
	}
	const icon =
		links.find((attrs) => /\bapple-touch-icon\b/i.test(attrs.rel ?? ''))?.href ??
		links.find((attrs) => /\bicon\b/i.test(attrs.rel ?? ''))?.href ??
		'/favicon.ico'
	const title = meta('og:title', 'twitter:title') || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')

	return {
		title: title.trim() || url.href,
		description: meta('og:description', 'twitter:description', 'description').trim(),
		image: toHttpUrl(meta('og:image', 'twitter:image'), base),
		favicon: toHttpUrl(icon, base),
	}
}

async function readText(response: Response, maxBytes: number) {
	const reader = response.body?.getReader()
	if (!reader) return ''
	const chunks: Uint8Array[] = []
	let total = 0
	while (total < maxBytes) {
		const { done, value } = await reader.read()
		if (done) break
		chunks.push(value)
		total += value.byteLength
	}
	await reader.cancel().catch(() => {})
	return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes))
}

function parseAttributes(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	for (const [, key, , doubleQuoted, singleQuoted, bare] of tag.matchAll(
		/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
	)) {
		attrs[key.toLowerCase()] = decodeEntities(doubleQuoted ?? singleQuoted ?? bare ?? '')
	}
	return attrs
}

function decodeEntities(text: string) {
	return text
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
}

/** Resolves a possibly-relative URL, keeping only http(s) results (images are loaded by the page). */
function toHttpUrl(value: string, base: string) {
	if (!value) return ''
	try {
		const url = new URL(value, base)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
	} catch {
		return ''
	}
}
