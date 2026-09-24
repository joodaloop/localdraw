import { utilityProcess, type MessagePortMain, type UtilityProcess } from 'electron'
import path from 'node:path'
import type { BackendMethods, BackendMethod, BackendRequest, BackendResponse } from '../shared/api'

interface Pending {
	resolve(value: unknown): void
	reject(error: Error): void
}

/** Owns the backend utility process: restarts it if it dies and routes calls to it. */
export class BackendProcess {
	private child: UtilityProcess | null = null
	private nextId = 1
	private pending = new Map<number, Pending>()
	private stopping = false

	constructor(
		private dbPath: string,
		private assetsDir: string
	) {}

	start() {
		const child = utilityProcess.fork(path.join(__dirname, 'backend.cjs'), [this.dbPath, this.assetsDir], {
			serviceName: 'Localdraw Backend',
			stdio: 'inherit',
		})
		child.on('message', (msg: BackendResponse) => {
			const pending = this.pending.get(msg.id)
			if (!pending) return
			this.pending.delete(msg.id)
			if (msg.ok) pending.resolve(msg.value)
			else pending.reject(new Error(msg.error))
		})
		child.on('exit', (code) => {
			if (this.child === child) this.child = null
			for (const { reject } of this.pending.values()) reject(new Error('backend exited'))
			this.pending.clear()
			if (!this.stopping) {
				console.error(`backend exited with code ${code}, restarting`)
				this.start()
			}
		})
		this.child = child
	}

	call<M extends BackendMethod>(
		method: M,
		...args: Parameters<BackendMethods[M]>
	): Promise<Awaited<ReturnType<BackendMethods[M]>>> {
		const child = this.child
		if (!child) return Promise.reject(new Error('backend is not running'))
		const id = this.nextId++
		const request: BackendRequest = { kind: 'call', id, method, args }
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
			child.postMessage(request)
		})
	}

	connectBoard(boardId: string, sessionId: string, port: MessagePortMain) {
		if (!this.child) {
			port.close()
			return
		}
		const request: BackendRequest = { kind: 'connect', boardId, sessionId }
		this.child.postMessage(request, [port])
	}

	stop() {
		this.stopping = true
		this.child?.kill()
	}
}
