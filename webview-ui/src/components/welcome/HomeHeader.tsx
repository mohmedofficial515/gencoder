import { EmptyRequest } from "@shared/proto/cline/common"
import ClineLogoSanta from "@/assets/ClineLogoSanta"
import ClineLogoTired from "@/assets/ClineLogoTired"
import ClineLogoVariable from "@/assets/ClineLogoVariable"
import { Button } from "@/components/ui/button"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { UiServiceClient } from "@/services/grpc-client"

interface HomeHeaderProps {
	shouldShowQuickWins?: boolean
}

const HomeHeader = ({ shouldShowQuickWins = false }: HomeHeaderProps) => {
	const { environment, lazyTeammateModeEnabled } = useExtensionState()

	const handleTakeATour = async () => {
		try {
			await UiServiceClient.openWalkthrough(EmptyRequest.create())
		} catch (error) {
			console.error("Error opening walkthrough:", error)
		}
	}

	// Lazy Teammate Mode takes priority, then December festive logo, then default
	const isDecember = new Date().getMonth() === 11 // 11 = December (0-indexed)
	const LogoComponent = lazyTeammateModeEnabled ? ClineLogoTired : isDecember ? ClineLogoSanta : ClineLogoVariable
	const headingText = lazyTeammateModeEnabled ? "I guess I'm here to help" : "What can I do for you?"

	// Per SPEC §7 risk: ClineLogoSanta needs more vertical room for the hat, so
	// special-case it to size-16 (64px). All other variants use size-14 (56px).
	const logoSize = isDecember && !lazyTeammateModeEnabled ? "size-16" : "size-14"

	return (
		<div className="flex flex-col items-center mb-5">
			<div className="my-3">
				<LogoComponent className={logoSize} environment={environment} />
			</div>
			<div className="text-center flex items-center justify-center px-4">
				<h1 className="m-0 font-bold">{headingText}</h1>
			</div>
			{shouldShowQuickWins && (
				<div className="mt-2">
					<Button onClick={handleTakeATour} size="sm" type="button" variant="ghost">
						Take a tour
						<span aria-hidden="true" className="codicon codicon-play scale-90" />
					</Button>
				</div>
			)}
		</div>
	)
}

export default HomeHeader
