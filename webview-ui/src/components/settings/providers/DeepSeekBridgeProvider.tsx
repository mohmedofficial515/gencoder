import { deepSeekBridgeModels } from "@shared/api"
import type { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ModelInfoView } from "../common/ModelInfoView"
import { normalizeApiConfiguration } from "../utils/providerUtils"

interface DeepSeekBridgeProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

export const DeepSeekBridgeProvider = ({ showModelOptions, isPopup, currentMode }: DeepSeekBridgeProviderProps) => {
	const { apiConfiguration } = useExtensionState()
	const { selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<p
				style={{
					fontSize: "13px",
					marginBottom: 8,
					color: "var(--vscode-foreground)",
				}}>
				DeepSeek Bridge routes requests through <strong>chat.deepseek.com</strong> via the GenCoder Chrome extension. No
				API key required — completely free.
			</p>

			<div
				style={{
					padding: "8px 12px",
					borderRadius: 4,
					backgroundColor: "var(--vscode-textBlockQuote-background)",
					borderLeft: "3px solid var(--vscode-textLink-foreground)",
					marginBottom: 8,
				}}>
				<p style={{ margin: 0, fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
					<strong style={{ color: "var(--vscode-foreground)" }}>Setup:</strong>
				</p>
				<ol
					style={{
						margin: "4px 0 0 0",
						paddingLeft: 16,
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					<li>
						Load the extension from <code>extension/</code> in Chrome (Developer mode)
					</li>
					<li>
						Open <strong>chat.deepseek.com</strong> and log in
					</li>
					<li>The bridge icon should show "Connected"</li>
				</ol>
			</div>

			{showModelOptions && (
				<ModelInfoView
					isPopup={isPopup}
					modelInfo={deepSeekBridgeModels["deepseek-bridge"]}
					selectedModelId="deepseek-bridge"
				/>
			)}
		</div>
	)
}
