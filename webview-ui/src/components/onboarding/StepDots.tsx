import { cn } from "@/lib/utils"

type StepDotsProps = {
	/** 1-based current step index. */
	current: number
	/** Total number of steps. */
	total: number
	className?: string
}

/**
 * Lightweight step indicator: `total` round dots with the active dot filled.
 *
 * Inspired by Cursor / Windsurf onboarding (per `.planning/design/research/onboarding.md`):
 * implicit progress beats enterprise "Step 2 of 3" chrome on a narrow VS Code panel.
 *
 * - Pure presentational; no animation library.
 * - Honors `prefers-reduced-motion` via `motion-safe:` Tailwind variant on the
 *   color transition.
 * - Group is announced as `aria-label="Step {n} of {total}"`; the active dot
 *   carries `aria-current="step"`.
 */
const StepDots = ({ current, total, className }: StepDotsProps) => {
	const safeCurrent = Math.max(1, Math.min(current, total))
	return (
		<div
			aria-label={`Step ${safeCurrent} of ${total}`}
			className={cn("flex items-center justify-center gap-1.5", className)}
			role="group">
			{Array.from({ length: total }, (_, i) => {
				const stepIndex = i + 1
				const isActive = stepIndex === safeCurrent
				return (
					<span
						aria-current={isActive ? "step" : undefined}
						aria-hidden={!isActive}
						className={cn(
							"size-1.5 rounded-full motion-safe:transition-colors motion-safe:duration-150",
							isActive ? "bg-button-background" : "bg-input-foreground/30",
						)}
						key={stepIndex}
					/>
				)
			})}
		</div>
	)
}

export default StepDots
