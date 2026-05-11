import React from "react"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/utils"
import { QuickWinTask } from "./quickWinTasks"

interface QuickWinCardProps {
	task: QuickWinTask
	onExecute: () => void
	isPending?: boolean
	disabled?: boolean
}

const ICON_BY_NAME: Record<string, string> = {
	WebAppIcon: "codicon-dashboard",
	TerminalIcon: "codicon-terminal",
	GameIcon: "codicon-game",
}

const renderIcon = (iconName?: string, isPending = false) => {
	if (isPending) {
		return (
			<span
				aria-hidden="true"
				className="codicon codicon-loading codicon-modifier-spin motion-reduce:codicon-modifier-disable-spin text-[20px]! leading-none!"
			/>
		)
	}
	const iconClass = (iconName && ICON_BY_NAME[iconName]) || "codicon-rocket"
	return <span aria-hidden="true" className={`codicon ${iconClass} text-[20px]! leading-none!`} />
}

const QuickWinCard: React.FC<QuickWinCardProps> = ({ task, onExecute, isPending = false, disabled = false }) => {
	const isDisabled = disabled || isPending
	const ariaLabel = `${task.title}. ${task.description}`

	return (
		<Item
			asChild
			className={cn(
				"w-full text-left bg-transparent border border-border-panel",
				"motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-in-out",
				"hover:bg-list-background-hover",
				"disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent",
				"focus-visible:bg-list-background-hover",
			)}
			size="sm">
			<button aria-label={ariaLabel} disabled={isDisabled} onClick={onExecute} type="button">
				<ItemMedia className="text-icon-foreground">{renderIcon(task.icon, isPending)}</ItemMedia>
				<ItemContent>
					<ItemTitle className="text-foreground truncate">{task.title}</ItemTitle>
					<ItemDescription className="text-description truncate">{task.description}</ItemDescription>
				</ItemContent>
			</button>
		</Item>
	)
}

export default QuickWinCard
