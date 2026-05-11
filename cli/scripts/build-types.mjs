#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(__dirname, "..")
const dist = resolve(cliRoot, "dist")
const distTypes = resolve(dist, "types")
const distAgent = resolve(dist, "agent")

const tscCmd = process.platform === "win32" ? "npx.cmd" : "npx"
const tsc = spawnSync(tscCmd, ["tsc", "-p", "tsconfig.lib.json"], {
	cwd: cliRoot,
	stdio: "inherit",
	shell: process.platform === "win32",
})
if (tsc.status !== 0) {
	console.warn(`[build-types] tsc exited with ${tsc.status}, continuing (this matches the previous "|| true" behavior).`)
}

function copy(rel, destRel) {
	const src = resolve(distTypes, rel)
	const dest = resolve(dist, destRel)
	if (!existsSync(src)) {
		console.warn(`[build-types] missing ${src}, skipping copy to ${destRel}`)
		return
	}
	mkdirSync(dirname(dest), { recursive: true })
	copyFileSync(src, dest)
}

copy("cli/src/exports.d.ts", "lib.d.ts")
mkdirSync(distAgent, { recursive: true })
copy("cli/src/agent/ClineAgent.d.ts", "agent/ClineAgent.d.ts")
copy("cli/src/agent/ClineSessionEmitter.d.ts", "agent/ClineSessionEmitter.d.ts")
copy("cli/src/agent/public-types.d.ts", "agent/public-types.d.ts")

if (existsSync(distTypes)) {
	rmSync(distTypes, { recursive: true, force: true })
}

console.log("[build-types] done")
