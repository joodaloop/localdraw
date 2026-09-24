import { cpSync, rmSync } from 'node:fs'
import { build } from 'vite'
import { dist, nodeBuilds, nodeConfig, rendererConfig, root } from './configs.js'

rmSync(dist(), { recursive: true, force: true })

for (const [entry, outDir] of nodeBuilds) {
	await build(nodeConfig(entry, outDir))
}
await build(rendererConfig())

// Distributions must carry our license, the tldraw license, and the notice explaining them.
cpSync(`${root}/licenses`, dist('licenses'), { recursive: true })
cpSync(`${root}/LICENSE`, dist('LICENSE'))
cpSync(`${root}/NOTICE.md`, dist('NOTICE.md'))
