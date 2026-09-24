// An append-only error log, so failures in the packaged app (which has no
// terminal) can be diagnosed after the fact. Main process only.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'

const MAX_LOG_BYTES = 1024 * 1024

let logFile: string | null = null

/** Logs to `<dir>/localdraw.log`; past 1 MB it's moved to `localdraw.old.log` and a new one started. */
export function initLog(dir: string) {
	mkdirSync(dir, { recursive: true })
	logFile = path.join(dir, 'localdraw.log')
}

/** Writes to stderr and the log file. `source` names the process the error came from. */
export function logError(source: string, ...args: unknown[]) {
	const text = format(...args)
	console.error(`[${source}]`, text)
	if (!logFile) return
	try {
		// Checked on every write, not just at startup, so a crash loop can't fill the disk.
		const size = statSync(logFile, { throwIfNoEntry: false })?.size ?? 0
		if (size > MAX_LOG_BYTES) renameSync(logFile, path.join(path.dirname(logFile), 'localdraw.old.log'))
		appendFileSync(logFile, `${new Date().toISOString()} [${source}] ${text}\n`)
	} catch {
		// Logging must never take the app down.
	}
}
