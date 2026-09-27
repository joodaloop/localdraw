// Regenerates src/renderer/icon-shapes/tabler-tags.json: extra search keywords for each Tabler
// icon ("trash" -> "delete bin garbage …"). Run after upgrading @tabler/icons-react.
//
// The tags ship only in the separate @tabler/icons package, as a 2MB icons.json. Rather than
// depend on that package, this fetches the file for exactly the installed icons-react version
// and keeps just the tags that aren't already words in the icon's name.

import { readFileSync, writeFileSync } from 'node:fs'
import { root } from './configs.js'

const { version } = JSON.parse(readFileSync(`${root}/node_modules/@tabler/icons-react/package.json`, 'utf8'))
const url = `https://cdn.jsdelivr.net/npm/@tabler/icons@${version}/icons.json`

const response = await fetch(url)
if (!response.ok) throw new Error(`fetching ${url}: ${response.status} ${response.statusText}`)
const icons = Object.values(await response.json())

const pascal = (kebab) =>
	kebab
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')

const tags = {}
for (const { name, tags: iconTags } of icons) {
	const nameWords = new Set(name.split('-'))
	const extra = [...new Set((iconTags ?? []).map((tag) => String(tag).toLowerCase().trim()))]
		.filter((tag) => tag && !nameWords.has(tag))
		.sort()
	// Keyed by the React component name, which is what the app works with.
	if (extra.length > 0) tags[`Icon${pascal(name)}`] = extra.join(' ')
}

const sorted = Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)))
const out = `${root}/src/renderer/icon-shapes/tabler-tags.json`
writeFileSync(out, `${JSON.stringify(sorted, null, '\t')}\n`)
console.log(`Wrote tags for ${Object.keys(sorted).length} icons (@tabler/icons ${version}) to ${out}`)
