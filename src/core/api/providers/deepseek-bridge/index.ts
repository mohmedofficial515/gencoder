import type { ModelInfo } from "@shared/api"
import type { ClineStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import type { ClineTool } from "@/shared/tools"
import type { ApiHandler, ApiHandlerModel } from "../../"
import type { ApiStream } from "../../transform/stream"
import { bridgeBus, getBridgeOptions, type SendPromptOptions, sendAttachImage, sendPrompt } from "./ws-server"

export const deepSeekBridgeModelId = "deepseek-bridge"

export const deepSeekBridgeModel: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 131072,
	supportsImages: true,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
	description: "DeepSeek chat via Chrome extension bridge (free — no API key required)",
}

function formatMessages(systemPrompt: string, messages: ClineStorageMessage[], startIndex = 0, includeSystem = true): string {
	const parts: string[] = []

	if (includeSystem && systemPrompt) {
		parts.push(`<system>\n${systemPrompt}\n</system>`)
	}

	for (let i = startIndex; i < messages.length; i++) {
		const msg = messages[i]
		const role = msg.role === "user" ? "human" : "assistant"
		let text = ""

		if (typeof msg.content === "string") {
			text = msg.content
		} else if (Array.isArray(msg.content)) {
			const textBlocks = msg.content.filter((b) => b.type === "text").map((b) => ("text" in b ? (b.text as string) : ""))
			text = textBlocks.join("\n")
		}

		if (text.trim()) {
			parts.push(`<${role}>\n${text}\n</${role}>`)
		}
	}

	return parts.join("\n\n")
}

interface ImageAttachment {
	data: string
	mediaType: string
}

function extractImages(messages: ClineStorageMessage[], startIndex = 0): ImageAttachment[] {
	const images: ImageAttachment[] = []
	for (let i = startIndex; i < messages.length; i++) {
		const msg = messages[i]
		if (!Array.isArray(msg.content)) continue
		for (const block of msg.content) {
			if (block.type === "image" && "source" in block) {
				const src = (block as any).source
				if (src?.type === "base64" && src.data && src.media_type) {
					images.push({ data: src.data, mediaType: src.media_type })
				}
			}
		}
	}
	return images
}

export class DeepSeekBridgeHandler implements ApiHandler {
	private abortController: AbortController | null = null

	// Stateful session tracking — enables delta sending (only new messages each turn)
	private sessionId: string | null = null
	private sentMessageCount = 0
	private lastChatId: string | null = null
	private contextLost = false

	// Bound listener refs so they can be removed in abort()
	private readonly _onChatIdChanged = (chatId: string) => {
		if (this.lastChatId !== null && chatId !== this.lastChatId) {
			this.contextLost = true
		}
		this.lastChatId = chatId
	}

	private readonly _onContextLost = () => {
		this.contextLost = true
	}

	private readonly _onNewChatClicked = () => {
		this.sessionId = null
		this.sentMessageCount = 0
		this.contextLost = false
		this.lastChatId = null
	}

	constructor() {
		bridgeBus.on("chat_id_changed", this._onChatIdChanged)
		bridgeBus.on("context_lost", this._onContextLost)
		bridgeBus.on("new_chat_clicked", this._onNewChatClicked)
	}

	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[], _tools?: ClineTool[]): ApiStream {
		this.abortController = new AbortController()
		const signal = this.abortController.signal

		const isFirstCall = this.sessionId === null || this.contextLost
		const startIndex = isFirstCall ? 0 : this.sentMessageCount

		if (isFirstCall) {
			this.sessionId = crypto.randomUUID()
			this.contextLost = false
		}

		const text = formatMessages(systemPrompt, messages, startIndex, isFirstCall)
		const modeOpts = getBridgeOptions()
		const opts: SendPromptOptions = {
			delta: !isFirstCall,
			sessionId: this.sessionId,
			deepThink: modeOpts.deepThink,
			search: modeOpts.search,
			responseMode: modeOpts.responseMode,
		}

		// Attach images from new messages before submitting the prompt
		const images = extractImages(messages, startIndex)
		if (images.length > 0) {
			for (const img of images) {
				if (signal.aborted) return
				try {
					await sendAttachImage(this.sessionId!, img.data, img.mediaType)
				} catch (err) {
					Logger.warn("[DeepSeek Bridge] Image attach failed:", err)
				}
			}
		}

		this.sentMessageCount = messages.length

		const streamQueue: Array<{ type: "text" | "reasoning"; text: string } | null> = []
		let wakeUp: (() => void) | null = null
		let error: Error | null = null

		const push = (item: { type: "text" | "reasoning"; text: string } | null) => {
			streamQueue.push(item)
			wakeUp?.()
			wakeUp = null
		}

		const requestPromise = sendPrompt(
			text,
			"auto",
			(chunk) => push({ type: "text", text: chunk }),
			(reasoning) => push({ type: "reasoning", text: reasoning }),
			opts,
		)
			.then(() => push(null))
			.catch((err: Error) => {
				error = err
				push(null)
			})

		signal.addEventListener("abort", () => {
			error = new Error("Request aborted")
			push(null)
		})

		while (true) {
			if (signal.aborted) break

			if (streamQueue.length === 0) {
				await new Promise<void>((r) => {
					wakeUp = r
				})
			}

			const item = streamQueue.shift()
			if (item == null) break

			if (item.type === "text") {
				yield { type: "text", text: item.text }
			} else if (item.type === "reasoning") {
				yield { type: "reasoning", reasoning: item.text }
			}
		}

		await requestPromise.catch(() => {})

		if (error && !signal.aborted) {
			throw error
		}

		yield {
			type: "usage",
			inputTokens: 0,
			outputTokens: 0,
			cacheWriteTokens: 0,
			cacheReadTokens: 0,
			totalCost: 0,
		}
	}

	getModel(): ApiHandlerModel {
		return {
			id: deepSeekBridgeModelId,
			info: deepSeekBridgeModel,
		}
	}

	abort(): void {
		this.abortController?.abort()
		this.abortController = null
		bridgeBus.off("chat_id_changed", this._onChatIdChanged)
		bridgeBus.off("context_lost", this._onContextLost)
		bridgeBus.off("new_chat_clicked", this._onNewChatClicked)
	}
}
