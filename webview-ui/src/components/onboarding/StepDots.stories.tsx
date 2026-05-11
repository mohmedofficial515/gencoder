import type { Meta } from "@storybook/react-vite"
import StepDots from "./StepDots"

const meta: Meta<typeof StepDots> = {
	title: "Onboarding/StepDots",
	component: StepDots,
	parameters: {
		docs: {
			description: {
				component:
					"Implicit 3-dot progress indicator used at the top of each onboarding step. The active dot is filled with `--vscode-button-background`; the others use `input-foreground/30`. Color transitions respect `prefers-reduced-motion`.",
			},
		},
	},
}

export default meta

/** Step 1 of 3 — user is on the user-type selection step. */
export const StepOneOfThree = () => (
	<div className="w-screen flex justify-center py-8">
		<StepDots current={1} total={3} />
	</div>
)

/** Step 2 of 3 — user has picked a user type and is selecting a model (or BYOK). */
export const StepTwoOfThree = () => (
	<div className="w-screen flex justify-center py-8">
		<StepDots current={2} total={3} />
	</div>
)

/** Step 3 of 3 — OAuth handoff is in progress. */
export const StepThreeOfThree = () => (
	<div className="w-screen flex justify-center py-8">
		<StepDots current={3} total={3} />
	</div>
)
