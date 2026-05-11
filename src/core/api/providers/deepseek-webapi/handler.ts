import { ModelInfo } from "@shared/api"
import { ClineStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import type { ApiHandler, ApiHandlerModel } from "../../"
import type { ApiStream } from "../../transform/stream"
import { getBridgeCredentials } from "../deepseek-bridge/ws-server"
import { buildBaseHeaders, getPoWHeader } from "./pow-solver"

export const deepSeekWebApiModelId = "deepseek-webapi"

export const deepSeekWebApiModel: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 131072,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
	description: "DeepSeek direct web API (no extension DOM needed — uses bearer token + PoW)",
}

const COMPLETION_URL = "https://chat.deepseek.com/api/v0/chat/completion"
const CREATE_SESSION_URL = "https://chat.deepseek.com/api/v0/chat/create_chat_session"

interface ChatSession {
	id: string
	lastMessageId: number
}

// ── SSE parser ported from injected.js ────────────────────────────────────────

function createSSEParser(onChunk: (text: string) => void, onReasoning: (text: string) => void) {
	let buf = ""
	let curPath: string | null = null
	let curOp = "APPEND"
	let inResponseFrag = false
	let inReasoningFrag = false
	let responseText = ""
	let reasoningText = ""
	let prevRespLen = 0
	let prevReasLen = 0

	function handle(obj: any) {
		// Format A: full snapshot {v:{response:{fragments:[{type,content}]}}}
		if (obj?.v?.response?.fragments && Array.isArray(obj.v.response.fragments)) {
			for (const f of obj.v.response.fragments) {
				if (f.type === "RESPONSE" && f.content) responseText += f.content
				if (f.type === "REASONING" && f.content) reasoningText += f.content
			}
			return
		}

		// Format B: OpenAI-style delta {choices:[{delta:{content|reasoning_content}}]}
		if (Array.isArray(obj?.choices) && obj.choices[0]?.delta !== undefined) {
			const d = obj.choices[0].delta
			if (typeof d.content === "string") responseText += d.content
			if (typeof d.text === "string") responseText += d.text
			if (typeof d.reasoning_content === "string") reasoningText += d.reasoning_content
			if (typeof d.thinking_content === "string") reasoningText += d.thinking_content
			return
		}

		if (obj.p !== undefined) curPath = obj.p
		if (obj.o !== undefined) curOp = String(obj.o).toUpperCase()

		const normPath = (curPath || "").replace(/^\//, "")

		// Format C: fragment append {p:"response/fragments", o:"APPEND", v:[{type,content}]}
		if (
			(normPath === "response/fragments" || normPath === "v/response/fragments") &&
			curOp === "APPEND" &&
			Array.isArray(obj.v)
		) {
			for (const f of obj.v) {
				if (f.type === "RESPONSE") {
					inResponseFrag = true
					inReasoningFrag = false
					if (f.content) responseText += f.content
				} else if (f.type === "REASONING") {
					inReasoningFrag = true
					inResponseFrag = false
					if (f.content) reasoningText += f.content
				} else {
					inResponseFrag = false
					inReasoningFrag = false
				}
			}
			return
		}

		// Format D: content delta {p:"response/fragments/-1/content", v:"chunk"}
		if (
			(normPath === "response/fragments/-1/content" || normPath === "v/response/fragments/-1/content") &&
			typeof obj.v === "string"
		) {
			if (inResponseFrag) {
				if (curOp === "SET") responseText = obj.v
				else responseText += obj.v
			} else if (inReasoningFrag) {
				if (curOp === "SET") reasoningText = obj.v
				else reasoningText += obj.v
			} else {
				responseText += obj.v
			}
			return
		}

		// Format E: choices path delta {p:"choices/0/delta/text", v:"chunk"}
		if (typeof obj.v === "string" && normPath && /^(choices\/\d+\/delta\/(text|content)|message\/content)$/.test(normPath)) {
			responseText += obj.v
			return
		}

		// Format E2: reasoning via path
		if (
			typeof obj.v === "string" &&
			normPath &&
			/^choices\/\d+\/delta\/(thinking_content|reasoning_content)$/.test(normPath)
		) {
			reasoningText += obj.v
		}
	}

	return {
		feed(chunk: string) {
			buf += chunk
			let nl: number
			while ((nl = buf.indexOf("\n")) !== -1) {
				const line = buf.slice(0, nl).trimEnd()
				buf = buf.slice(nl + 1)
				if (!line.startsWith("data:")) continue
				const raw = line.slice(5).trim()
				if (!raw || raw === "[DONE]") continue
				try {
					handle(JSON.parse(raw))
				} catch (_) {}

				if (responseText.length > prevRespLen) {
					const delta = responseText.slice(prevRespLen)
					prevRespLen = responseText.length
					if (delta) onChunk(delta)
				}
				if (reasoningText.length > prevReasLen) {
					const delta = reasoningText.slice(prevReasLen)
					prevReasLen = reasoningText.length
					if (delta) onReasoning(delta)
				}
			}
		},
		getText: () => responseText.trim(),
		getReasoning: () => reasoningText.trim(),
	}
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class DeepSeekWebApiHandler implements ApiHandler {
	private session: ChatSession | null = null
	private aborted = false
	// Delta tracking: how many messages were already sent in this session
	private sentMessageCount = 0

	private getCredentials(): { token: string; cookies?: string } {
		const creds = getBridgeCredentials()
		if (!creds.bearerToken) {
			throw new Error("DeepSeek Web API: no bearer token — open chat.deepseek.com with the GenCoder extension active")
		}
		return { token: creds.bearerToken, cookies: creds.cookies || undefined }
	}

	private formatPrompt(systemPrompt: string, messages: ClineStorageMessage[], startIndex = 0, includeSystem = true): string {
		const parts: string[] = []
		if (includeSystem && systemPrompt) parts.push(`<system>\n${systemPrompt}\n</system>`)
		for (let i = startIndex; i < messages.length; i++) {
			const msg = messages[i]
			const role = msg.role === "user" ? "human" : "assistant"
			let text = ""
			if (typeof msg.content === "string") {
				text = msg.content
			} else if (Array.isArray(msg.content)) {
				text = msg.content
					.filter((b) => b.type === "text")
					.map((b) => ("text" in b ? (b.text as string) : ""))
					.join("\n")
			}
			if (text.trim()) parts.push(`<${role}>\n${text}\n</${role}>`)
		}
		return parts.join("\n\n")
	}

	private async ensureSession(powHeader: string, token: string, cookies?: string): Promise<ChatSession> {
		if (this.session) return this.session

		const resp = await fetch(CREATE_SESSION_URL, {
			method: "POST",
			headers: {
				...buildBaseHeaders(token, cookies),
				"x-ds-pow-response": powHeader,
			},
			body: JSON.stringify({ character_id: null }),
		})

		if (!resp.ok) {
			const body = await resp.text().catch(() => "")
			throw new Error(`Failed to create chat session: ${resp.status} — ${body}`)
		}

		const json = (await resp.json()) as any
		const id =
			json?.data?.biz_data?.id || json?.data?.biz_data?.chat_session_id || json?.data?.id || json?.data?.chat_session_id

		if (!id) {
			throw new Error(`Could not extract session ID from: ${JSON.stringify(json).slice(0, 300)}`)
		}

		Logger.log(`[DeepSeek WebAPI] Session created: ${id}`)
		this.session = { id, lastMessageId: 0 }
		return this.session
	}

	async *createMessage(systemPrompt: string, messages: ClineStorageMessage[]): ApiStream {
		this.aborted = false
		const { token, cookies } = this.getCredentials()

		// Solve PoW (runs in ~0.3s on average with difficulty=144000)
		Logger.log("[DeepSeek WebAPI] Solving PoW challenge...")
		const powHeader = await getPoWHeader(token, cookies)
		Logger.log("[DeepSeek WebAPI] PoW solved")

		const isFirstCall = this.session === null
		const session = await this.ensureSession(powHeader, token, cookies)

		// Delta mode: first call sends full history, subsequent calls send only new messages.
		// This avoids context duplication (DeepSeek stores the conversation server-side).
		const startIndex = isFirstCall ? 0 : this.sentMessageCount
		const prompt = this.formatPrompt(systemPrompt, messages, startIndex, isFirstCall)
		Logger.log(
			`[DeepSeek WebAPI] isFirstCall=${isFirstCall} startIndex=${startIndex} messages=${messages.length} promptLen=${prompt.length}`,
		)

		const body = JSON.stringify({
			chat_session_id: session.id,
			model_type: null,
			parent_message_id: session.lastMessageId,
			preempt: false,
			prompt,
			ref_file_ids: [],
			search_enabled: false,
			thinking_enabled: false,
		})

		const resp = await fetch(COMPLETION_URL, {
			method: "POST",
			headers: {
				...buildBaseHeaders(token, cookies),
				"x-ds-pow-response": powHeader,
				"Content-Length": Buffer.byteLength(body).toString(),
			},
			body,
		})

		if (!resp.ok) {
			const text = await resp.text().catch(() => "")
			throw new Error(`DeepSeek WebAPI completion failed: ${resp.status} — ${text.slice(0, 400)}`)
		}

		const streamQueue: Array<{ type: "text" | "reasoning"; text: string } | null> = []
		let wakeUp: (() => void) | null = null
		let streamError: Error | null = null
		let finalText = ""

		const push = (item: (typeof streamQueue)[number]) => {
			streamQueue.push(item)
			wakeUp?.()
			wakeUp = null
		}

		const parser = createSSEParser(
			(chunk) => push({ type: "text", text: chunk }),
			(reasoning) => push({ type: "reasoning", text: reasoning }),
		)

		// Read SSE stream in background
		;(async () => {
			try {
				const reader = (resp.body as any).getReader()
				const decoder = new TextDecoder()
				while (!this.aborted) {
					const { done, value } = await reader.read()
					if (done) break
					parser.feed(decoder.decode(value, { stream: true }))
				}
				finalText = parser.getText()
			} catch (e: any) {
				streamError = e
			} finally {
				push(null)
			}
		})()

		while (true) {
			if (streamQueue.length === 0) {
				await new Promise<void>((r) => {
					wakeUp = r
				})
			}
			const item = streamQueue.shift()
			if (item == null) break
			if (item.type === "text") yield { type: "text", text: item.text }
			else yield { type: "reasoning", reasoning: item.text }
		}

		if (streamError && !this.aborted) throw streamError

		// Track message ID for next turn (increment by 2: user + assistant)
		session.lastMessageId += 2
		// Track how many messages we've sent so next call only sends the delta
		this.sentMessageCount = messages.length

		Logger.log(`[DeepSeek WebAPI] Done — ${finalText.length} chars`)

		yield { type: "usage", inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 }
	}

	getModel(): ApiHandlerModel {
		return { id: deepSeekWebApiModelId, info: deepSeekWebApiModel }
	}

	abort(): void {
		this.aborted = true
		this.session = null
		this.sentMessageCount = 0
	}
}
