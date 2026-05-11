import type { Meta } from "@storybook/react-vite"
import QuickWinCard from "./QuickWinCard"
import { quickWinTasks } from "./quickWinTasks"

const meta: Meta<typeof QuickWinCard> = {
	title: "Welcome/QuickWinCard",
	component: QuickWinCard,
	parameters: {
		docs: {
			description: {
				component:
					"A single suggested task row. Composes shadcn Item with a real <button> for keyboard accessibility and aria-label. Supports idle / pending / disabled states.",
			},
		},
	},
}

export default meta

const sampleTask = quickWinTasks[0]

export const Default = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[640px] px-4">
			<QuickWinCard onExecute={() => undefined} task={sampleTask} />
		</div>
	</div>
)

/**
 * Pending state: shows a spinning loading icon and disables the button. The
 * spinner stops automatically when the user has prefers-reduced-motion set
 * (motion-reduce:codicon-modifier-disable-spin).
 */
export const Pending = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[640px] px-4">
			<QuickWinCard isPending onExecute={() => undefined} task={sampleTask} />
		</div>
	</div>
)

/**
 * Disabled state used by SuggestedTasks while a sibling card is pending — the
 * row dims but still announces its label to screen readers.
 */
export const Disabled = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[640px] px-4">
			<QuickWinCard disabled onExecute={() => undefined} task={sampleTask} />
		</div>
	</div>
)

/**
 * All three production tasks rendered in a stack — useful for spot-checking
 * truncation behavior and icon alignment across icon variants.
 */
export const AllTasks = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-full max-w-[640px] px-4 flex flex-col gap-1">
			{quickWinTasks.map((task) => (
				<QuickWinCard key={task.id} onExecute={() => undefined} task={task} />
			))}
		</div>
	</div>
)

/**
 * Same stack at the narrow VS Code panel width (~320px) — confirms that
 * titles and descriptions truncate cleanly without wrapping.
 */
export const NarrowPanel = () => (
	<div className="w-screen flex justify-center py-8">
		<div className="w-[320px] px-4 flex flex-col gap-1 border border-border-panel">
			{quickWinTasks.map((task) => (
				<QuickWinCard key={task.id} onExecute={() => undefined} task={task} />
			))}
		</div>
	</div>
)
