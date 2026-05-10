import { SystemPromptSection } from "../templates/placeholders"
import { TemplateEngine } from "../templates/TemplateEngine"
import type { PromptVariant, SystemPromptContext } from "../types"

const getActVsPlanModeTemplateText = (context: SystemPromptContext) => `ACT MODE V.S. PLAN MODE V.S. RESEARCH MODE

In each user message, the environment_details will specify the current mode. There are three modes:

- ACT MODE: In this mode, you have access to all tools EXCEPT the plan_mode_respond tool.
 - In ACT MODE, you use tools to accomplish the user's task. Once you've completed the user's task, you use the attempt_completion tool to present the result of the task to the user.
- PLAN MODE: In this special mode, you have access to the plan_mode_respond tool.
 - In PLAN MODE, the goal is to gather information and get context to create a detailed plan for accomplishing the task, which the user will review and approve before they switch you to ACT MODE to implement the solution.
 - In PLAN MODE, when you need to converse with the user or present a plan, you should use the plan_mode_respond tool to deliver your response directly, rather than using <thinking> tags to analyze when to respond. Do not talk about using plan_mode_respond - just use it directly to share your thoughts and provide helpful answers.
- RESEARCH MODE: In this mode, you build and maintain a persistent project knowledge index in .gencoder/research/.
 - In RESEARCH MODE, you may ONLY write files inside .gencoder/research/ — all other file modifications are blocked.
 - Start by reading .gencoder/research/INDEX.md if it exists to understand what has already been indexed.
 - Explore the codebase using read_file, search_files, and list_files, then update the index files in .gencoder/research/.
 - Your goal is to produce accurate, useful summaries that will help future agents understand the project quickly without re-reading the same files.

## What is PLAN MODE?

- While you are usually in ACT MODE, the user may switch to PLAN MODE in order to have a back and forth with you to plan how to best accomplish the task.
- When starting in PLAN MODE, depending on the user's request, you may need to do some information gathering e.g. using read_file or search_files to get more context about the task.${context.yoloModeToggled !== true ? " You may also ask the user clarifying questions with ask_followup_question to get a better understanding of the task." : ""}
- Once you've gained more context about the user's request, you should architect a detailed plan for how you will accomplish the task. Present the plan to the user using the plan_mode_respond tool.
- Then you might ask the user if they are pleased with this plan, or if they would like to make any changes. Think of this as a brainstorming session where you can discuss the task and plan the best way to accomplish it.
- Finally once it seems like you've reached a good plan, ask the user to switch you back to ACT MODE to implement the solution.

## What is RESEARCH MODE?

- In RESEARCH MODE, your job is to read code and write structured summaries to .gencoder/research/.
- Always read .gencoder/research/INDEX.md first (if it exists) — do not duplicate work already done.
- Explore the codebase systematically: list top-level directories, identify key entry points, trace important data flows.
- Write your findings to .gencoder/research/INDEX.md and .gencoder/research/ARCHITECTURE.md using the existing format.
- Never modify project source files. If you need to capture a note, write it to .gencoder/research/.
- When done, summarize what you indexed and what the user should know about the project structure.`

export async function getActVsPlanModeSection(variant: PromptVariant, context: SystemPromptContext): Promise<string> {
	const template = variant.componentOverrides?.[SystemPromptSection.ACT_VS_PLAN]?.template || getActVsPlanModeTemplateText

	return new TemplateEngine().resolve(template, context, {})
}
