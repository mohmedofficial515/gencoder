import { listFiles } from "@services/glob/list-files"
import * as crypto from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import { formatArchitectureMd, formatIndexMd, TechStack } from "./IndexFormatter"
import { architectureFile, ensureGitignore, ensureResearchDirs, indexFile, manifestFile, RESEARCH_DIR } from "./ResearchPaths"

export interface ManifestEntry {
	sha256: string
	mtime: number
	loc: number
	indexedAt: string
}

export interface Manifest {
	lastFullScan: string | null
	workspacePath: string
	projectName: string
	files: Record<string, ManifestEntry>
}

function sha256(content: string): string {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex")
}

async function computeEntry(filePath: string): Promise<ManifestEntry | null> {
	try {
		const [content, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)])
		return {
			sha256: sha256(content),
			mtime: stat.mtimeMs,
			loc: content.split("\n").length,
			indexedAt: new Date().toISOString(),
		}
	} catch {
		return null
	}
}

async function detectTechStack(workspacePath: string): Promise<TechStack> {
	const stack: TechStack = {}
	try {
		const pkgRaw = await fs.readFile(path.join(workspacePath, "package.json"), "utf8")
		const pkg = JSON.parse(pkgRaw)
		const deps = { ...pkg.dependencies, ...pkg.devDependencies }

		if (deps["typescript"] || deps["ts-node"]) stack.Language = "TypeScript"
		else if (deps["@babel/core"] || pkg.main?.endsWith(".js")) stack.Language = "JavaScript"

		if (deps["react"]) stack.Framework = "React"
		else if (deps["vue"]) stack.Framework = "Vue"
		else if (deps["@angular/core"]) stack.Framework = "Angular"
		else if (deps["@vscode/vsce"] || deps["vsce"]) stack.Framework = "VS Code Extension"

		if (deps["esbuild"]) stack.Build = "esbuild"
		else if (deps["webpack"]) stack.Build = "webpack"
		else if (deps["vite"]) stack.Build = "Vite"

		if (deps["vitest"]) stack.Tests = "Vitest"
		else if (deps["jest"]) stack.Tests = "Jest"
		else if (deps["mocha"]) stack.Tests = "Mocha"
	} catch {
		// No package.json or unreadable — leave stack empty
	}
	return stack
}

class ResearchIndexer {
	private instances = new Map<string, boolean>()

	private manifestPath(workspacePath: string): string {
		return manifestFile(workspacePath)
	}

	async loadManifest(workspacePath: string): Promise<Manifest> {
		try {
			const raw = await fs.readFile(this.manifestPath(workspacePath), "utf8")
			return JSON.parse(raw) as Manifest
		} catch {
			return {
				lastFullScan: null,
				workspacePath,
				projectName: path.basename(workspacePath),
				files: {},
			}
		}
	}

	private async saveManifest(workspacePath: string, manifest: Manifest): Promise<void> {
		await fs.writeFile(this.manifestPath(workspacePath), JSON.stringify(manifest, null, 2), "utf8")
	}

	private async writeOutputFiles(workspacePath: string, manifest: Manifest): Promise<void> {
		const techStack = await detectTechStack(workspacePath)
		const indexContent = formatIndexMd(manifest)
		const archContent = formatArchitectureMd(manifest, techStack)
		await Promise.all([
			fs.writeFile(indexFile(workspacePath), indexContent, "utf8"),
			fs.writeFile(architectureFile(workspacePath), archContent, "utf8"),
		])
	}

	private isInsideResearch(workspacePath: string, filePath: string): boolean {
		const researchAbs = path.resolve(workspacePath, RESEARCH_DIR)
		return filePath.startsWith(researchAbs)
	}

	async rebuild(workspacePath: string): Promise<{ indexed: number; durationMs: number }> {
		const start = Date.now()
		Logger.log("[Research] Starting full rebuild...")

		await ensureResearchDirs(workspacePath)
		await ensureGitignore(workspacePath)

		const [allFiles] = await listFiles(workspacePath, true, 10000)
		const manifest: Manifest = {
			lastFullScan: new Date().toISOString(),
			workspacePath,
			projectName: path.basename(workspacePath),
			files: {},
		}

		let indexed = 0
		for (const absPath of allFiles) {
			if (this.isInsideResearch(workspacePath, absPath)) continue
			const entry = await computeEntry(absPath)
			if (!entry) continue
			const relPath = path.relative(workspacePath, absPath).replace(/\\/g, "/")
			manifest.files[relPath] = entry
			indexed++
		}

		await this.saveManifest(workspacePath, manifest)
		await this.writeOutputFiles(workspacePath, manifest)

		const durationMs = Date.now() - start
		Logger.log(`[Research] Full rebuild complete: ${indexed} files in ${durationMs}ms`)
		return { indexed, durationMs }
	}

	async refresh(workspacePath: string): Promise<{ updated: number; removed: number; durationMs: number }> {
		const start = Date.now()
		Logger.log("[Research] Starting incremental refresh...")

		await ensureResearchDirs(workspacePath)

		const manifest = await this.loadManifest(workspacePath)
		if (!manifest.lastFullScan) {
			// No prior scan — run rebuild instead
			const result = await this.rebuild(workspacePath)
			return { updated: result.indexed, removed: 0, durationMs: result.durationMs }
		}

		const [allFiles] = await listFiles(workspacePath, true, 10000)
		const currentPaths = new Set<string>()

		let updated = 0
		for (const absPath of allFiles) {
			if (this.isInsideResearch(workspacePath, absPath)) continue
			const relPath = path.relative(workspacePath, absPath).replace(/\\/g, "/")
			currentPaths.add(relPath)

			let stat: { mtimeMs: number } | null = null
			try {
				stat = await fs.stat(absPath)
			} catch {
				continue
			}

			const existing = manifest.files[relPath]
			if (existing && Math.abs(existing.mtime - stat.mtimeMs) < 10) {
				continue // unchanged
			}

			const entry = await computeEntry(absPath)
			if (entry && entry.sha256 !== existing?.sha256) {
				manifest.files[relPath] = entry
				updated++
			}
		}

		// Remove deleted files
		let removed = 0
		for (const relPath of Object.keys(manifest.files)) {
			if (!currentPaths.has(relPath)) {
				delete manifest.files[relPath]
				removed++
			}
		}

		if (updated > 0 || removed > 0) {
			manifest.lastFullScan = new Date().toISOString()
			await this.saveManifest(workspacePath, manifest)
			await this.writeOutputFiles(workspacePath, manifest)
		}

		const durationMs = Date.now() - start
		Logger.log(`[Research] Incremental refresh: +${updated} updated, -${removed} removed in ${durationMs}ms`)
		return { updated, removed, durationMs }
	}

	async refreshFile(workspacePath: string, absFilePath: string): Promise<void> {
		if (this.isInsideResearch(workspacePath, absFilePath)) return
		const manifest = await this.loadManifest(workspacePath)
		const relPath = path.relative(workspacePath, absFilePath).replace(/\\/g, "/")

		try {
			await fs.access(absFilePath)
			const entry = await computeEntry(absFilePath)
			if (entry) {
				manifest.files[relPath] = entry
			}
		} catch {
			delete manifest.files[relPath]
		}

		await this.saveManifest(workspacePath, manifest)
		await this.writeOutputFiles(workspacePath, manifest)
	}
}

export const researchIndexer = new ResearchIndexer()
