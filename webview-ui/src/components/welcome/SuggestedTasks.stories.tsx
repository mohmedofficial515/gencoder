import type { Meta } from "@storybook/react-vite"
import { SuggestedTasks } from "./SuggestedTasks"

const meta: Meta<typeof SuggestedTasks> = {
	title: "Welcome/SuggestedTasks",
	component: SuggestedTasks,
	parameters: {
		docs: {
			description: {
				component:
					"Heading + accessible list of suggested quick-win starter tasks. Wraps a <section aria-labelledby> with a <ul role='list'>; each card is an interactive <button>. The heading uses the calmer single-color 'Try one of these to start' microcopy.",
			},
		},
	},
}

export default meta

export const Default = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[700px]">
			<SuggestedTasks shouldShowQuickWins={true} />
		</div>
	</div>
)

/**
 * When shouldShowQuickWins is false the component renders nothing — kept here
 * for visual regression coverage.
 */
export const Hidden = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[700px] border border-dashed border-border-panel">
			<SuggestedTasks shouldShowQuickWins={false} />
			<div className="text-description text-xs text-center py-2">
				(SuggestedTasks renders null when shouldShowQuickWins is false)
			</div>
		</div>
	</div>
)

/**
 * In a narrow VS Code panel the heading stays centered and each card row
 * fills the available width.
 */
export const NarrowPanel = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-[320px] border border-border-panel">
			<SuggestedTasks shouldShowQuickWins={true} />
		</div>
	</div>
)
