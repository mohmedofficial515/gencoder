import type { Meta } from "@storybook/react-vite"
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react"
import { useState } from "react"
import ClineLogoWhite from "@/assets/ClineLogoWhite"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { NEW_USER_TYPE } from "./data-steps"
import { UserTypeSelectionStep } from "./OnboardingView"
import StepDots from "./StepDots"

/**
 * Stories cover the four user-visible states called out in `SPEC.md §8`:
 *
 *  1. Step 0 with FREE pre-selected (user-type radiogroup)
 *  2. Step 1 with a model pre-selected (lightweight static mock so we avoid
 *     mounting `useOnboardingModels` / `useExtensionState`)
 *  3. Step 2 in the "waiting on browser" loading state
 *  4. Step 2 with an OAuth error surfaced via the destructive Alert + Retry
 *
 * The Storybook deliberately scaffolds the layout shell here (logo + StepDots +
 * title + content + footer) instead of mounting `OnboardingView` directly,
 * because `OnboardingView` reads global gRPC state. We re-use the same
 * primitives so visual regressions still catch token / spacing drift.
 */
const meta: Meta = {
	title: "Onboarding/OnboardingView",
	parameters: {
		docs: {
			description: {
				component:
					"Onboarding flow scaffold. The shell (logo 48px, three step dots, title, description, error Alert, content, action buttons, fallback link) is shared across all four states. The radiogroup semantics are exercised by `UserTypeSelectionStep`; the other states use a mocked layout because the real `OnboardingView` requires extension state.",
			},
		},
	},
}

export default meta

/** Re-usable shell so all four stories share identical chrome. */
const Shell = ({
	step,
	title,
	description,
	error,
	loading,
	showFallbackLink,
	primary,
	secondary,
	footerHint,
	children,
}: {
	step: number
	title: string
	description?: string
	error?: string | null
	loading?: boolean
	showFallbackLink?: boolean
	primary?: { text: string; variant?: "default" | "secondary" }
	secondary?: { text: string; variant?: "default" | "secondary" }
	footerHint?: boolean
	children?: React.ReactNode
}) => (
	<div className="w-screen min-h-[600px] flex flex-col items-center justify-start gap-4 px-5 py-8">
		<ClineLogoWhite className="size-12 flex-shrink-0" />
		<StepDots current={step} total={3} />
		<h2 className="text-lg font-semibold p-0 flex-shrink-0">{title}</h2>
		{loading && (
			<div
				aria-busy={true}
				aria-label="Waiting for sign-in to finish in your browser"
				className="flex w-full max-w-lg flex-col gap-6 my-4 items-center"
				role="status">
				<LoaderCircleIcon className="motion-safe:animate-spin" />
			</div>
		)}
		{description && <p className="text-foreground text-sm text-center m-0 p-0 flex-shrink-0">{description}</p>}
		{error && (
			<div className="w-full max-w-lg flex-shrink-0">
				<Alert isDismissible={false} title="Sign-in failed" variant="danger">
					<AlertDescription>
						<p className="mb-2">{error}</p>
						<Button size="sm" variant="secondary">
							Retry
						</Button>
					</AlertDescription>
				</Alert>
			</div>
		)}
		<div className="flex-1 w-full flex max-w-lg overflow-y-auto min-h-0">{children}</div>
		<footer className="flex w-full max-w-lg flex-col gap-3 my-2 px-2 flex-shrink-0">
			{primary && (
				<Button className="w-full rounded-xs" variant={primary.variant ?? "default"}>
					{primary.text}
				</Button>
			)}
			{secondary && (
				<Button className="w-full rounded-xs" variant={secondary.variant ?? "secondary"}>
					{secondary.text}
				</Button>
			)}
			{showFallbackLink && (
				<button
					className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 self-center bg-transparent border-0 p-0 cursor-pointer"
					type="button">
					Browser didn't open? Try again.
				</button>
			)}
			{footerHint && (
				<div className="items-center justify-center flex text-sm text-muted-foreground gap-2 mb-3 text-pretty">
					<AlertCircleIcon className="shrink-0 size-2" /> You can change this later in settings
				</div>
			)}
		</footer>
	</div>
)

/**
 * Step 1 of 3 — user-type radiogroup with `FREE` preselected. This story uses
 * the real `UserTypeSelectionStep` component so radiogroup semantics (Tab into
 * the group, arrow keys move selection, Enter activates) are exercisable.
 */
export const StepZero_UserType_FreePreselected = () => {
	const [userType, setUserType] = useState<NEW_USER_TYPE>(NEW_USER_TYPE.FREE)
	return (
		<Shell
			description="Choose how you want to power your assistant."
			footerHint={true}
			primary={{ text: "Continue" }}
			secondary={{ text: "Login to GenCoder" }}
			step={1}
			title="How will you use GenCoder?">
			<UserTypeSelectionStep onSelectUserType={setUserType} userType={userType} />
		</Shell>
	)
}

/**
 * Step 2 of 3 — model picked (visual mock). Shows the unified selected-state
 * border + bg combination from SPEC §5. We render a single static card to keep
 * the story independent of the model-fetching hook.
 */
export const StepOne_ModelPicked = () => (
	<Shell primary={{ text: "Create my Account" }} secondary={{ text: "Back" }} step={2} title="Select your model">
		<div className="flex flex-col w-full items-center px-2">
			<div aria-label="Choose a model" className="flex w-full max-w-lg flex-col gap-6 my-4" role="radiogroup">
				<div className="flex flex-col gap-3">
					<h4 className="text-sm font-semibold text-muted-foreground mb-2">Frontier</h4>
					<div
						aria-checked={true}
						className="bg-input-background/80 border border-button-background cursor-pointer rounded-sm p-2 flex flex-col gap-1 motion-safe:transition-colors motion-safe:duration-150"
						role="radio"
						tabIndex={0}>
						<div className="flex w-full justify-between text-sm font-medium">
							<span className="font-semibold">Claude Sonnet 4</span>
							<span className="px-1.5 py-0.5 text-xs rounded bg-input-background/50">Recommended</span>
						</div>
						<div className="text-muted-foreground text-sm">Support: Images, Prompt Cache, Tools</div>
					</div>
					<div
						aria-checked={false}
						className="border border-input-foreground/30 hover:bg-input-background/40 cursor-pointer rounded-sm p-2 motion-safe:transition-colors motion-safe:duration-150"
						role="radio"
						tabIndex={-1}>
						<div className="flex w-full justify-between text-sm font-medium">
							<span className="font-semibold">GPT-5</span>
							<span className="px-1.5 py-0.5 text-xs rounded bg-input-background/50">$$</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Shell>
)

/**
 * Step 3 of 3 — OAuth handoff: the user clicked "Create my Account", the
 * browser opened, and we're waiting. The fallback "Browser didn't open?" link
 * is visible so the user has a path out of a stuck state.
 */
export const StepTwo_OAuth_Loading = () => (
	<Shell
		description="We opened your browser to finish sign-in. Come back here when you're done."
		loading={true}
		secondary={{ text: "Back" }}
		showFallbackLink={true}
		step={3}
		title="Almost there!"
	/>
)

/**
 * Step 3 of 3 — OAuth failed. Previously this would have been a silent
 * `.catch(() => {})`; now the user sees a destructive Alert with a Retry CTA.
 */
export const StepTwo_OAuth_Error = () => (
	<Shell
		description="We opened your browser to finish sign-in. Come back here when you're done."
		error="Sign-in failed. Please try again."
		secondary={{ text: "Back" }}
		showFallbackLink={true}
		step={3}
		title="Almost there!"
	/>
)
