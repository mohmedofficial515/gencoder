import ApiOptions from "../ApiOptions"
import Section from "../Section"

interface ApiConfigurationSectionProps {
	renderSectionHeader?: (tabId: string) => JSX.Element | null
	initialModelTab?: "recommended" | "free"
}

const ApiConfigurationSection = ({ renderSectionHeader }: ApiConfigurationSectionProps) => {
	return (
		<div>
			{renderSectionHeader?.("api-config")}
			<Section>
				<ApiOptions currentMode="act" showModelOptions={true} />
				<div className="mb-[5px]">
					<em className="text-xs text-(--vscode-descriptionForeground)">
						GenCoder تستخدم DeepSeek Bridge حصرياً. جميع الطلبات تُوجّه عبر إضافة Chrome إلى chat.deepseek.com.
					</em>
				</div>
			</Section>
		</div>
	)
}

export default ApiConfigurationSection
