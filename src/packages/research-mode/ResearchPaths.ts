import * as fs from "fs/promises"
import * as path from "path"

export const RESEARCH_DIR = ".gencoder/research"
export const CACHE_DIR = ".gencoder/research/.cache"
export const INDEX_FILE = ".gencoder/research/INDEX.md"
export const ARCHITECTURE_FILE = ".gencoder/research/ARCHITECTURE.md"
export const MANIFEST_FILE = ".gencoder/research/.cache/manifest.json"
export const GITIGNORE_ENTRY = ".gencoder/research/.cache/"

export function researchDir(workspacePath: string): string {
	return path.join(workspacePath, RESEARCH_DIR)
}

export function cacheDir(workspacePath: string): string {
	return path.join(workspacePath, CACHE_DIR)
}

export function indexFile(workspacePath: string): string {
	return path.join(workspacePath, INDEX_FILE)
}

export function architectureFile(workspacePath: string): string {
	return path.join(workspacePath, ARCHITECTURE_FILE)
}

export function manifestFile(workspacePath: string): string {
	return path.join(workspacePath, MANIFEST_FILE)
}

export async function ensureResearchDirs(workspacePath: string): Promise<void> {
	await fs.mkdir(path.join(workspacePath, RESEARCH_DIR), { recursive: true })
	await fs.mkdir(path.join(workspacePath, CACHE_DIR), { recursive: true })
}

export async function ensureGitignore(workspacePath: string): Promise<void> {
	const gitignorePath = path.join(workspacePath, ".gitignore")
	try {
		const content = await fs.readFile(gitignorePath, "utf8")
		if (!content.includes(GITIGNORE_ENTRY)) {
			await fs.appendFile(gitignorePath, `\n# GenCoder research cache (auto-generated)\n${GITIGNORE_ENTRY}\n`)
		}
	} catch {
		await fs.writeFile(gitignorePath, `# GenCoder research cache (auto-generated)\n${GITIGNORE_ENTRY}\n`)
	}
}
