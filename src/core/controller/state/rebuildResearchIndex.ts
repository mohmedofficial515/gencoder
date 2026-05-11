import { researchIndexer, researchWatcher } from "@packages/research-mode"
import { Boolean, EmptyRequest } from "@shared/proto/cline/common"
import { Logger } from "@/shared/services/Logger"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

export async function rebuildResearchIndex(_controller: Controller, _: EmptyRequest): Promise<Boolean> {
	try {
		const workspacePath = await getCwd()
		if (!workspacePath) {
			Logger.error("[Research] rebuildResearchIndex: no workspace path")
			return Boolean.create({ value: false })
		}
		researchWatcher.watch(workspacePath)
		await researchIndexer.rebuild(workspacePath)
		return Boolean.create({ value: true })
	} catch (err) {
		Logger.error("[Research] rebuildResearchIndex failed:", err)
		return Boolean.create({ value: false })
	}
}
