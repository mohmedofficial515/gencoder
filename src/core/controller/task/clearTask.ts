import { Empty, EmptyRequest } from "@shared/proto/cline/common"
import { notifyBridgeNewChat } from "@/core/api/providers/deepseek-bridge/ws-server"
import { Controller } from ".."

/**
 * Clears the current task
 * @param controller The controller instance
 * @param _request The empty request
 * @returns Empty response
 */
export async function clearTask(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	// clearTask is called here when the user closes the task
	await controller.clearTask()
	await controller.postStateToWebview()

	// Tell the Chrome extension to start a fresh chat on deepseek.com
	// No-op if the bridge isn't connected or provider isn't "deepseek-bridge"
	try {
		notifyBridgeNewChat()
	} catch {
		/* ignore — bridge may not be running */
	}

	return Empty.create()
}
