import { EventEmitter } from "events"
import * as http from "http"
import { WebSocket, WebSocketServer } from "ws"
import { Logger } from "@/shared/services/Logger"

const PORT = 9876
const WS_PATH = "/ws/deepseek-bridge"
const REQUEST_TIMEOUT_MS = 120_000
const ATTACH_TIMEOUT_MS = 8_000

type PendingRequest = {
	onChunk: (text: string) => void
	onReasoning: (text: string) => void
	onDone: (text: string) => void
	onError: (code: string, detail: string) => void
}

export interface SendPromptOptions {
	delta?: boolean
	sessionId?: string | null
	deepThink?: boolean
	search?: boolean
	responseMode?: "instant" | "expert"
}

// Broadcast bus — handler instances subscribe to receive out-of-band events from the extension
export const bridgeBus = new EventEmitter()
bridgeBus.setMaxListeners(20)

// Module-level mode options kept in sync by the settings controller
let _bridgeOptions: { deepThink: boolean; search: boolean; responseMode: "instant" | "expert" } = {
	deepThink: false,
	search: false,
	responseMode: "instant",
}

export function setBridgeOptions(opts: Partial<typeof _bridgeOptions>) {
	_bridgeOptions = { ..._bridgeOptions, ...opts }
}

export function getBridgeOptions() {
	return { ..._bridgeOptions }
}

let httpServer: http.Server | null = null
let wss: WebSocketServer | null = null
let extensionWs: WebSocket | null = null
let lastError: string | null = null
const pending = new Map<string, PendingRequest>()

// Credentials received from the extension (bearerToken + optional cookies)
let _bearerToken = ""
let _cookies = ""

export function getBridgeCredentials() {
	return { bearerToken: _bearerToken, cookies: _cookies }
}

export function setBridgeCredentials(bearerToken: string, cookies: string) {
	_bearerToken = bearerToken
	_cookies = cookies
	Logger.log("[DeepSeek Bridge] Credentials updated — token length:", bearerToken.length)
}

export function getBridgeStatus() {
	return {
		connected: extensionWs !== null && extensionWs.readyState === WebSocket.OPEN,
		pending: pending.size,
		lastError,
	}
}

export function sendPrompt(
	text: string,
	mode: "auto" | "visible",
	onChunk: (text: string) => void,
	onReasoning: (text: string) => void,
	opts: SendPromptOptions = {},
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
			reject(new Error("Chrome extension not connected — open chat.deepseek.com and activate the extension"))
			return
		}

		const id = crypto.randomUUID()
		const timer = setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				reject(new Error("DeepSeek bridge request timed out after 2 minutes"))
			}
		}, REQUEST_TIMEOUT_MS)

		pending.set(id, {
			onChunk,
			onReasoning,
			onDone: (fullText) => {
				clearTimeout(timer)
				pending.delete(id)
				resolve(fullText)
			},
			onError: (code, detail) => {
				clearTimeout(timer)
				pending.delete(id)
				reject(new Error(`${code}: ${detail}`))
			},
		})

		const payload = {
			type: "prompt",
			id,
			text,
			mode,
			delta: opts.delta ?? false,
			sessionId: opts.sessionId ?? null,
			options: {
				deepThink: opts.deepThink ?? false,
				search: opts.search ?? false,
				responseMode: opts.responseMode ?? "instant",
			},
		}

		try {
			extensionWs.send(JSON.stringify(payload))
		} catch (e) {
			pending.delete(id)
			clearTimeout(timer)
			reject(e)
		}
	})
}

export function sendAttachImage(reqId: string, data: string, mimeType: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) {
			reject(new Error("Chrome extension not connected"))
			return
		}

		const timer = setTimeout(() => {
			bridgeBus.off("attach_progress", onProgress)
			reject(new Error("Image attach timed out"))
		}, ATTACH_TIMEOUT_MS)

		const onProgress = (id: string) => {
			if (id === reqId) {
				clearTimeout(timer)
				bridgeBus.off("attach_progress", onProgress)
				resolve()
			}
		}
		bridgeBus.on("attach_progress", onProgress)

		try {
			extensionWs.send(JSON.stringify({ type: "attach_image", id: reqId, data, mimeType }))
		} catch (e) {
			clearTimeout(timer)
			bridgeBus.off("attach_progress", onProgress)
			reject(e)
		}
	})
}

export function notifyBridgeNewChat(): void {
	if (!extensionWs || extensionWs.readyState !== WebSocket.OPEN) return
	try {
		extensionWs.send(JSON.stringify({ type: "new_chat" }))
		Logger.log("[DeepSeek Bridge] Sent new_chat to extension")
	} catch (e) {
		Logger.warn("[DeepSeek Bridge] Failed to send new_chat:", e)
	}
}

export function cancelPrompt(id: string) {
	const req = pending.get(id)
	if (req) {
		pending.delete(id)
		req.onError("cancelled", "Request cancelled by user")
	}
}

function handleExtensionMessage(raw: string) {
	let msg: Record<string, unknown>
	try {
		msg = JSON.parse(raw)
	} catch {
		return
	}

	const { type, id } = msg as { type: string; id?: string }

	if (type === "hello") {
		Logger.log("[DeepSeek Bridge] Chrome extension connected")
		// Ask extension to send its bearer token immediately
		try {
			extensionWs?.send(JSON.stringify({ type: "request_token" }))
		} catch {
			/* ignore */
		}
		return
	}

	if (type === "token") {
		const token = (msg.bearerToken as string) || ""
		const cookies = (msg.cookies as string) || ""
		setBridgeCredentials(token, cookies)
		return
	}

	if (type === "pong") return

	// Out-of-band events — emit to subscribers (handler instances)
	if (type === "chat_id_changed") {
		Logger.log("[DeepSeek Bridge] Chat ID changed:", msg.chatId)
		bridgeBus.emit("chat_id_changed", msg.chatId as string)
		return
	}

	if (type === "context_lost") {
		Logger.log("[DeepSeek Bridge] Context lost:", msg.reason)
		bridgeBus.emit("context_lost", msg.reason as string)
		return
	}

	if (type === "new_chat_clicked") {
		Logger.log("[DeepSeek Bridge] User clicked New Chat on deepseek.com")
		bridgeBus.emit("new_chat_clicked")
		return
	}

	if (type === "attach_progress") {
		bridgeBus.emit("attach_progress", id as string)
		return
	}

	if (!id) return

	const req = pending.get(id as string)
	if (!req) return

	switch (type) {
		case "chunk":
			req.onChunk((msg.text as string) || "")
			break
		case "reasoning":
			req.onReasoning((msg.text as string) || "")
			break
		case "done":
			req.onDone((msg.text as string) || "")
			break
		case "error":
			req.onError((msg.code as string) || "error", (msg.detail as string) || "")
			break
	}
}

export function startBridgeServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (httpServer) {
			resolve()
			return
		}

		httpServer = http.createServer((req, res) => {
			if (req.url === "/status" && req.method === "GET") {
				const status = getBridgeStatus()
				res.writeHead(200, {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*",
				})
				res.end(JSON.stringify(status))
				return
			}
			res.writeHead(404)
			res.end()
		})

		wss = new WebSocketServer({ server: httpServer, path: WS_PATH })

		wss.on("connection", (ws, req) => {
			Logger.log("[DeepSeek Bridge] New WebSocket connection from", req.socket.remoteAddress)

			if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
				extensionWs.close()
			}
			extensionWs = ws
			lastError = null

			ws.on("message", (data) => {
				handleExtensionMessage(data.toString())
			})

			ws.on("close", () => {
				Logger.log("[DeepSeek Bridge] Chrome extension disconnected")
				if (extensionWs === ws) extensionWs = null
				lastError = "Extension disconnected"
				for (const [, req] of pending) {
					req.onError("disconnected", "Chrome extension disconnected")
				}
				pending.clear()
			})

			ws.on("error", (err) => {
				lastError = err.message
				Logger.error("[DeepSeek Bridge] WebSocket error:", err)
			})

			try {
				ws.send(JSON.stringify({ type: "ack", status: "connected" }))
			} catch {
				/* ignore */
			}
		})

		httpServer.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				Logger.warn(`[DeepSeek Bridge] Port ${PORT} already in use — another instance may be running`)
				resolve()
			} else {
				reject(err)
			}
		})

		httpServer.listen(PORT, "127.0.0.1", () => {
			Logger.log(`[DeepSeek Bridge] Server listening on port ${PORT}`)
			resolve()
		})
	})
}

export function stopBridgeServer(): Promise<void> {
	return new Promise((resolve) => {
		for (const [, req] of pending) {
			req.onError("server_stopping", "Bridge server is stopping")
		}
		pending.clear()
		if (extensionWs) {
			try {
				extensionWs.close()
			} catch {
				/* ignore */
			}
			extensionWs = null
		}
		if (wss) {
			wss.close()
			wss = null
		}
		if (httpServer) {
			httpServer.close(() => resolve())
			httpServer = null
		} else {
			resolve()
		}
	})
}
