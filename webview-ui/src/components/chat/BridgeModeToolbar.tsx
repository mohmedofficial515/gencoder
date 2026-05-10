import React, { useCallback } from "react"
import { getModeSpecificFields } from "@/components/settings/utils/providerUtils"
import { updateSetting } from "@/components/settings/utils/settingsHandlers"
import { useExtensionState } from "@/context/ExtensionStateContext"

const BridgeModeToolbar: React.FC = () => {
	const { apiConfiguration, mode, deepSeekBridgeDeepThink, deepSeekBridgeSearch, deepSeekBridgeResponseMode } =
		useExtensionState()

	const { apiProvider } = getModeSpecificFields(apiConfiguration, mode)

	if (apiProvider !== "deepseek-bridge") {
		return null
	}

	const toggleDeepThink = useCallback(() => {
		updateSetting("deepSeekBridgeDeepThink", !deepSeekBridgeDeepThink)
	}, [deepSeekBridgeDeepThink])

	const toggleSearch = useCallback(() => {
		updateSetting("deepSeekBridgeSearch", !deepSeekBridgeSearch)
	}, [deepSeekBridgeSearch])

	const setResponseMode = useCallback((m: "instant" | "expert") => {
		updateSetting("deepSeekBridgeResponseMode", m)
	}, [])

	const pillBase: React.CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: 4,
		padding: "2px 8px",
		borderRadius: 12,
		fontSize: 11,
		fontWeight: 500,
		cursor: "pointer",
		border: "1px solid var(--vscode-button-border, transparent)",
		userSelect: "none",
		transition: "background 0.15s, color 0.15s",
	}

	const pillActive: React.CSSProperties = {
		...pillBase,
		background: "var(--vscode-button-background)",
		color: "var(--vscode-button-foreground)",
	}

	const pillInactive: React.CSSProperties = {
		...pillBase,
		background: "var(--vscode-input-background)",
		color: "var(--vscode-descriptionForeground)",
	}

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "3px 6px",
				flexWrap: "wrap",
			}}>
			<span
				onClick={toggleDeepThink}
				style={deepSeekBridgeDeepThink ? pillActive : pillInactive}
				title="Enable DeepThink (chain-of-thought reasoning)">
				🧠 DeepThink
			</span>

			<span onClick={toggleSearch} style={deepSeekBridgeSearch ? pillActive : pillInactive} title="Enable web search">
				🌐 Search
			</span>

			<div
				style={{
					display: "inline-flex",
					borderRadius: 12,
					overflow: "hidden",
					border: "1px solid var(--vscode-button-border, var(--vscode-input-border))",
				}}>
				<span
					onClick={() => setResponseMode("instant")}
					style={{
						...pillBase,
						borderRadius: "12px 0 0 12px",
						...(deepSeekBridgeResponseMode !== "expert" ? pillActive : pillInactive),
					}}
					title="Instant response mode">
					Instant
				</span>
				<span
					onClick={() => setResponseMode("expert")}
					style={{
						...pillBase,
						borderRadius: "0 12px 12px 0",
						...(deepSeekBridgeResponseMode === "expert" ? pillActive : pillInactive),
					}}
					title="Expert response mode">
					Expert
				</span>
			</div>
		</div>
	)
}

export default BridgeModeToolbar
