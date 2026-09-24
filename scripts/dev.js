// Starts the renderer dev server (with hot reload), watches the Node-side
// bundles, and restarts Electron whenever main, preload or backend change.

import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import electronPath from 'electron'
import { build, createServer } from 'vite'
import { dist, nodeBuilds, nodeConfig, rendererConfig, root } from './configs.js'

rmSync(dist(), { recursive: true, force: true })

const server = await createServer(rendererConfig())
await server.listen()
const devServerUrl = server.resolvedUrls.local[0]

let electron = null
let restartTimer
let quitting = false

function startElectron() {
	electron = spawn(electronPath, [root, ...process.argv.slice(2)], {
		stdio: 'inherit',
		env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
	})
	electron.on('exit', () => {
		// Closing the app ends the dev session; restarts kill it deliberately.
		if (electron?.killed || quitting) return
		void shutdown()
	})
}

function restartElectron() {
	clearTimeout(restartTimer)
	restartTimer = setTimeout(() => {
		if (electron) {
			const old = electron
			electron = null
			old.kill()
		}
		startElectron()
	}, 100)
}

async function shutdown() {
	quitting = true
	electron?.kill()
	await server.close()
	process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Each watcher emits END after every successful (re)build.
let initialBuildsRemaining = nodeBuilds.length
for (const [entry, outDir] of nodeBuilds) {
	const watcher = await build(nodeConfig(entry, outDir, { watch: true }))
	watcher.on('event', (event) => {
		if (event.code === 'ERROR') console.error(event.error)
		if (event.code !== 'END') return
		if (initialBuildsRemaining > 0) {
			if (--initialBuildsRemaining === 0) startElectron()
		} else {
			restartElectron()
		}
	})
}
