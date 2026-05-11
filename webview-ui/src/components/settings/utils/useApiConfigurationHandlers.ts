import { ApiConfiguration } from "@shared/api"
import { UpdateApiConfigurationPartialRequest } from "@shared/proto/cline/models"
import { convertApiConfigurationToProto } from "@shared/proto-conversions/models/api-configuration-conversion"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelsServiceClient } from "@/services/grpc-client"

export const useApiConfigurationHandlers = () => {
	const { apiConfiguration, planActSeparateModelsSetting } = useExtensionState()

	/**
	 * Updates a single field using a partial update (field mask) so the backend
	 * merges only this field into the current config. Avoids race conditions where
	 * stale webview state could overwrite provider or other settings changed earlier.
	 */
	const handleFieldChange = async <K extends keyof ApiConfiguration>(field: K, value: ApiConfiguration[K]) => {
		const partial: Partial<ApiConfiguration> = { [field]: value }
		const protoConfig = convertApiConfigurationToProto(partial as ApiConfiguration)
		await ModelsServiceClient.updateApiConfigurationPartial(
			UpdateApiConfigurationPartialRequest.create({
				apiConfiguration: protoConfig,
				updateMask: [field as string],
			}),
		)
	}

	/**
	 * Updates multiple fields at once using a partial update (field mask).
	 * All listed fields are applied atomically on the backend without touching
	 * fields not in the mask, preventing stale-state overwrites.
	 */
	const handleFieldsChange = async (updates: Partial<ApiConfiguration>) => {
		const protoConfig = convertApiConfigurationToProto(updates as ApiConfiguration)
		const mask = Object.keys(updates)
		await ModelsServiceClient.updateApiConfigurationPartial(
			UpdateApiConfigurationPartialRequest.create({
				apiConfiguration: protoConfig,
				updateMask: mask,
			}),
		)
	}

	const handleModeFieldChange = async <PlanK extends keyof ApiConfiguration, ActK extends keyof ApiConfiguration>(
		fieldPair: { plan: PlanK; act: ActK },
		value: ApiConfiguration[PlanK] & ApiConfiguration[ActK],
		currentMode: Mode,
	) => {
		if (planActSeparateModelsSetting) {
			const effectiveMode: "plan" | "act" = currentMode === "research" ? "act" : currentMode
			const targetField = fieldPair[effectiveMode]
			await handleFieldChange(targetField, value)
		} else {
			await handleFieldsChange({
				[fieldPair.plan]: value,
				[fieldPair.act]: value,
			})
		}
	}

	/**
	 * Updates multiple mode-specific fields in a single atomic operation.
	 */
	const handleModeFieldsChange = async <T extends Record<string, any>>(
		fieldPairs: { [K in keyof T]: { plan: keyof ApiConfiguration; act: keyof ApiConfiguration } },
		values: T,
		currentMode: Mode,
	) => {
		if (planActSeparateModelsSetting) {
			const updates: Partial<ApiConfiguration> = {}
			Object.entries(fieldPairs).forEach(([key, { plan, act }]) => {
				const targetField = currentMode === "plan" ? plan : act
				updates[targetField] = values[key]
			})
			await handleFieldsChange(updates)
		} else {
			const updates: Partial<ApiConfiguration> = {}
			Object.entries(fieldPairs).forEach(([key, { plan, act }]) => {
				updates[plan] = values[key]
				updates[act] = values[key]
			})
			await handleFieldsChange(updates)
		}
	}

	return { handleFieldChange, handleFieldsChange, handleModeFieldChange, handleModeFieldsChange }
}
