// Packages dist/ into a macOS app, release/Localdraw.app, using only tools that
// ship with macOS: it's Electron's own app bundle with our code, name and icon
// inside, signed for this machine. With --install, also copies it to /Applications.
//
// For distributing to other people (a .dmg, Developer ID signing, notarization,
// auto-updates) use a real packager such as electron-builder instead.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import electronPath from 'electron'
import { dist, root } from './configs.js'

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const APP_NAME = pkg.productName
const BUNDLE_ID = 'com.joodaloop.localdraw'
const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: 'inherit' })

if (process.platform !== 'darwin') throw new Error('scripts/package.js only builds macOS apps')
if (!existsSync(dist('main', 'main.cjs')) || !existsSync(dist('renderer', 'index.html'))) {
	throw new Error('No production build in dist/. Run `pnpm build` first.')
}

// electronPath is …/Electron.app/Contents/MacOS/Electron
const electronApp = path.resolve(electronPath, '../../..')
const release = path.join(root, 'release')
const app = path.join(release, `${APP_NAME}.app`)
const resources = path.join(app, 'Contents', 'Resources')
const plist = path.join(app, 'Contents', 'Info.plist')

rmSync(app, { recursive: true, force: true })
mkdirSync(release, { recursive: true })
// ditto preserves the framework symlinks and permissions that cp can mangle.
run('ditto', electronApp, app)

// Our code: Electron runs Resources/app instead of its default app.
rmSync(path.join(resources, 'default_app.asar'), { force: true })
cpSync(dist(), path.join(resources, 'app', 'dist'), {
	recursive: true,
	filter: (src) => !src.endsWith('.map'),
})
writeFileSync(
	path.join(resources, 'app', 'package.json'),
	JSON.stringify({ name: pkg.name, productName: APP_NAME, version: pkg.version, main: pkg.main }, null, 2)
)

// Icon: every size macOS asks for, from the 1024px source.
const iconset = path.join(release, 'icon.iconset')
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
	for (const scale of [1, 2]) {
		const px = String(size * scale)
		const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
		execFileSync('sips', ['-z', px, px, path.join(root, 'build', 'icon.png'), '--out', path.join(iconset, name)])
	}
}
run('iconutil', '-c', 'icns', iconset, '-o', path.join(resources, 'icon.icns'))
rmSync(iconset, { recursive: true })
rmSync(path.join(resources, 'electron.icns'), { force: true })

const setPlist = (key, type, value) => run('plutil', '-replace', key, type, value, plist)
setPlist('CFBundleName', '-string', APP_NAME)
setPlist('CFBundleDisplayName', '-string', APP_NAME)
setPlist('CFBundleIdentifier', '-string', BUNDLE_ID)
setPlist('CFBundleShortVersionString', '-string', pkg.version)
setPlist('CFBundleVersion', '-string', pkg.version)
setPlist('CFBundleIconFile', '-string', 'icon.icns')
setPlist('LSApplicationCategoryType', '-string', 'public.app-category.graphics-design')

// Changing the bundle invalidates Electron's signature, and Apple Silicon won't run
// unsigned apps. An ad-hoc signature ("-") is enough to run it on this Mac.
run('codesign', '--force', '--deep', '--sign', '-', app)
console.log(`Packaged ${app}`)

if (process.argv.includes('--install')) {
	const installed = `/Applications/${APP_NAME}.app`
	// pgrep exits non-zero when nothing matches.
	const isRunning = (() => {
		try {
			execFileSync('pgrep', ['-f', `${installed}/`])
			return true
		} catch {
			return false
		}
	})()
	if (isRunning) throw new Error(`${APP_NAME} is running. Quit it (⌘Q) and try again.`)
	rmSync(installed, { recursive: true, force: true })
	run('ditto', app, installed)
	console.log(`Installed ${installed}`)
}
