import type { Meta } from "@storybook/react-vite"
import HomeHeader from "./HomeHeader"

const meta: Meta<typeof HomeHeader> = {
	title: "Welcome/HomeHeader",
	component: HomeHeader,
	parameters: {
		docs: {
			description: {
				component:
					"The hero header shown on the no-active-task home view. Renders the GenCoder logo, the headline 'What can I do for you?', and (when quick wins are enabled) a demoted ghost-variant 'Take a tour' button.",
			},
		},
	},
}

export default meta

/**
 * Default appearance for a returning user with quick wins enabled.
 * The tour button is a small ghost button placed below the headline.
 */
export const Default = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[700px]">
			<HomeHeader shouldShowQuickWins={true} />
		</div>
	</div>
)

/**
 * Without the quick wins flag, the tour button is omitted entirely and the
 * hero is even quieter (logo + headline only).
 */
export const WithoutTour = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[700px]">
			<HomeHeader shouldShowQuickWins={false} />
		</div>
	</div>
)

/**
 * In a narrow VS Code panel (~320px), the layout still composes cleanly: the
 * logo stays centered and the tour button stays below the headline.
 */
export const NarrowPanel = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-[320px] border border-border-panel">
			<HomeHeader shouldShowQuickWins={true} />
		</div>
	</div>
)
