import { NewTaskRequest } from "@shared/proto/cline/task"
import React, { useState } from "react"
import { TaskServiceClient } from "@/services/grpc-client"
import QuickWinCard from "./QuickWinCard"
import { QuickWinTask, quickWinTasks } from "./quickWinTasks"

export const SuggestedTasks: React.FC<{ shouldShowQuickWins: boolean }> = ({ shouldShowQuickWins }) => {
	const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)

	const handleExecuteQuickWin = async (task: QuickWinTask) => {
		if (pendingTaskId) {
			return
		}
		setPendingTaskId(task.id)
		try {
			await TaskServiceClient.newTask(NewTaskRequest.create({ text: task.prompt, images: [] }))
		} catch (error) {
			console.error("Error executing quick win:", error)
			setPendingTaskId(null)
		}
	}

	if (!shouldShowQuickWins) {
		return null
	}

	return (
		<section aria-labelledby="suggested-tasks-heading" className="px-4 pt-1 pb-3 select-none">
			<h2 className="text-sm font-medium mb-2.5 text-center text-description" id="suggested-tasks-heading">
				Try one of these to start
			</h2>
			<ul className="flex flex-col gap-1 list-none m-0 p-0" role="list">
				{quickWinTasks.map((task: QuickWinTask) => (
					<li key={task.id}>
						<QuickWinCard
							disabled={pendingTaskId !== null && pendingTaskId !== task.id}
							isPending={pendingTaskId === task.id}
							onExecute={() => handleExecuteQuickWin(task)}
							task={task}
						/>
					</li>
				))}
			</ul>
		</section>
	)
}
