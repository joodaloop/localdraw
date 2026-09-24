import { rmSync } from 'node:fs'
import { build } from 'vite'
import { dist, nodeBuilds, nodeConfig, rendererConfig } from './configs.js'

rmSync(dist(), { recursive: true, force: true })

for (const [entry, outDir] of nodeBuilds) {
	await build(nodeConfig(entry, outDir))
}
await build(rendererConfig())
