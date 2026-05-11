import chokidar, { FSWatcher } from "chokidar"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import { researchIndexer } from "./ResearchIndexer"
import { RESEARCH_DIR } from "./ResearchPaths"

const DEBOUNCE_MS = 30_000

class ResearchWatcher {
	private watchers = new Map<string, FSWatcher>()
	private timers = new Map<string, ReturnType<typeof setTimeout>>()
	private pendingPaths = new Map<string, Set<string>>()

	watch(workspacePath: string): void {
		if (this.watchers.has(workspacePath)) return

		const researchAbsDir = path.resolve(workspacePath, RESEARCH_DIR)

		const watcher = chokidar.watch(workspacePath, {
			persistent: false,
			ignoreInitial: true,
			ignored: [researchAbsDir, /node_modules/, /\.git\//],
			awaitWriteFinish: {
				stabilityThreshold: 500,
				pollInterval: 100,
			},
		})

		watcher.on("add", (filePath) => this.enqueue(workspacePath, filePath))
		watcher.on("change", (filePath) => this.enqueue(workspacePath, filePath))
		watcher.on("unlink", (filePath) => this.enqueue(workspacePath, filePath))
		watcher.on("error", (err) => Logger.error("[Research] Watcher error:", err))

		this.watchers.set(workspacePath, watcher)
		Logger.log(`[Research] Watching ${workspacePath} for changes (debounce ${DEBOUNCE_MS / 1000}s)`)
	}

	private enqueue(workspacePath: string, filePath: string): void {
		if (!this.pendingPaths.has(workspacePath)) {
			this.pendingPaths.set(workspacePath, new Set())
		}
		this.pendingPaths.get(workspacePath)!.add(filePath)

		const existing = this.timers.get(workspacePath)
		if (existing) clearTimeout(existing)

		const timer = setTimeout(() => this.flush(workspacePath), DEBOUNCE_MS)
		this.timers.set(workspacePath, timer)
	}

	private async flush(workspacePath: string): Promise<void> {
		this.timers.delete(workspacePath)
		const paths = this.pendingPaths.get(workspacePath)
		this.pendingPaths.delete(workspacePath)

		if (!paths || paths.size === 0) return

		Logger.log(`[Research] Debounce fired for ${paths.size} changed file(s) — running refresh`)
		try {
			await researchIndexer.refresh(workspacePath)
		} catch (err) {
			Logger.error("[Research] Error during debounced refresh:", err)
		}
	}

	stop(workspacePath: string): void {
		const timer = this.timers.get(workspacePath)
		if (timer) {
			clearTimeout(timer)
			this.timers.delete(workspacePath)
		}
		this.pendingPaths.delete(workspacePath)
		const watcher = this.watchers.get(workspacePath)
		if (watcher) {
			watcher.close().catch(() => {})
			this.watchers.delete(workspacePath)
		}
	}

	dispose(): void {
		for (const workspacePath of [...this.watchers.keys()]) {
			this.stop(workspacePath)
		}
	}
}

export const researchWatcher = new ResearchWatcher()
