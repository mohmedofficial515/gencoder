// background.js — service worker
// Maintains a singleton WebSocket to the DeepSeek Bridge WS server.
// Forwards prompts to the active chat.deepseek.com tab via content script Port,
// and streams chunk/reasoning/done messages back over the WebSocket.

const WS_URL = "ws://127.0.0.1:9876/ws/deepseek-bridge"
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]
const HEARTBEAT_MS = 20000

let ws = null
let reconnectAttempt = 0
let heartbeatTimer = null
let lastStatus = {
	connected: false,
	lastError: null,
	lastMessageAt: null,
	activeTabId: null,
	activeChatId: null,
}

function setStatus(patch) {
	lastStatus = { ...lastStatus, ...patch }
	chrome.storage.local.set({ bridge_status: lastStatus })
}

async function findDeepSeekTab(mode = "auto") {
	if (mode === "visible") {
		const focused = await chrome.tabs.query({
			url: "https://chat.deepseek.com/*",
			active: true,
			lastFocusedWindow: true,
		})
		if (focused.length) {
			console.log("[hs-bridge] (visible) using active focused tab:", focused[0].id, focused[0].url)
			return focused[0]
		}
		return null
	}

	let tabs = await chrome.tabs.query({
		url: "https://chat.deepseek.com/*",
		active: true,
		lastFocusedWindow: true,
	})
	if (tabs.length) {
		console.log("[hs-bridge] (auto) active tab in focused window:", tabs[0].id, tabs[0].url)
		return tabs[0]
	}
	tabs = await chrome.tabs.query({ url: "https://chat.deepseek.com/*", active: true })
	if (tabs.length) {
		console.log("[hs-bridge] (auto) active tab in some window:", tabs[0].id, tabs[0].url)
		return tabs[0]
	}
	tabs = await chrome.tabs.query({ url: "https://chat.deepseek.com/*" })
	if (tabs.length) {
		tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
		console.log("[hs-bridge] (auto) most-recent chat tab:", tabs[0].id, tabs[0].url, "out of", tabs.length)
		return tabs[0]
	}
	console.warn("[hs-bridge] NO chat.deepseek.com tab found")
	return null
}

function scheduleReconnect() {
	const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
	reconnectAttempt += 1
	setTimeout(connect, delay)
}

function startHeartbeat() {
	stopHeartbeat()
	heartbeatTimer = setInterval(() => {
		if (ws && ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify({ type: "ping" }))
			} catch (e) {
				/* ignore */
			}
		}
	}, HEARTBEAT_MS)
}

function stopHeartbeat() {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer)
		heartbeatTimer = null
	}
}

function connect() {
	try {
		ws = new WebSocket(WS_URL)
	} catch (e) {
		setStatus({ connected: false, lastError: String(e) })
		scheduleReconnect()
		return
	}

	ws.onopen = async () => {
		reconnectAttempt = 0
		const tab = await findDeepSeekTab()
		setStatus({
			connected: true,
			lastError: null,
			activeTabId: tab ? tab.id : null,
		})
		try {
			ws.send(
				JSON.stringify({
					type: "hello",
					role: "extension",
					version: "0.4.0",
					tab_url: tab ? tab.url : null,
				}),
			)
		} catch (e) {
			/* ignore */
		}
		startHeartbeat()
		// Send token immediately on connect
		sendBearerTokenToServer()
	}

	ws.onmessage = async (event) => {
		let msg
		try {
			msg = JSON.parse(event.data)
		} catch (e) {
			return
		}
		setStatus({ lastMessageAt: Date.now() })

		if (msg.type === "prompt") {
			await handlePrompt(msg)
		} else if (msg.type === "new_chat") {
			await handleNewChat(msg)
		} else if (msg.type === "attach_image") {
			await handleAttachImage(msg)
		} else if (msg.type === "request_token") {
			// Server is asking for the bearer token (used by direct web API approach)
			sendBearerTokenToServer()
		} else if (msg.type === "ack" || msg.type === "pong") {
			// server-side liveness — nothing to do
		}
	}

	ws.onerror = (e) => {
		setStatus({ connected: false, lastError: "websocket error" })
	}

	ws.onclose = () => {
		stopHeartbeat()
		setStatus({ connected: false })
		ws = null
		scheduleReconnect()
	}
}

async function handlePrompt(msg) {
	const { id, text, max_tokens, temperature, mode, options } = msg
	const requestedMode = mode === "visible" ? "visible" : "auto"
	console.log("[hs-bridge] handlePrompt id=", id, "mode=", requestedMode, "delta=", msg.delta, "len=", text?.length)

	const tab = await findDeepSeekTab(requestedMode)
	if (!tab) {
		const reason =
			requestedMode === "visible"
				? "no ACTIVE chat.deepseek.com tab — switch to it and retry"
				: "no chat.deepseek.com tab open"
		console.warn("[hs-bridge] no tab — aborting", id, reason)
		sendError(id, "tab_closed", reason)
		return
	}
	setStatus({ activeTabId: tab.id })

	const flat = text || ""
	console.log("[hs-bridge] sending to tab", tab.id, "first 80 chars:", flat.slice(0, 80))

	let port
	try {
		port = chrome.tabs.connect(tab.id, { name: `hs-stream-${id}` })
	} catch (e) {
		sendError(id, "tab_closed", String(e))
		return
	}

	port.onMessage.addListener((pmsg) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			port.disconnect()
			return
		}
		switch (pmsg.type) {
			case "chunk":
				ws.send(JSON.stringify({ type: "chunk", id, text: pmsg.text }))
				break
			case "reasoning":
				ws.send(JSON.stringify({ type: "reasoning", id, text: pmsg.text }))
				break
			case "done":
				ws.send(JSON.stringify({ type: "done", id, text: pmsg.text, finish_reason: "stop", latency_ms: pmsg.latencyMs }))
				break
			case "error":
				sendError(id, pmsg.code || "stream_error", pmsg.detail || "")
				break
		}
	})

	port.postMessage({ type: "submit_prompt", id, text: flat, mode: requestedMode, options: options || null })
}

async function handleNewChat(msg) {
	const tab = await findDeepSeekTab("auto")
	if (!tab) {
		console.warn("[hs-bridge] new_chat: no tab found")
		return
	}

	const reqId = "nc-" + Date.now()
	let port
	try {
		port = chrome.tabs.connect(tab.id, { name: `hs-cmd-${reqId}` })
	} catch (e) {
		console.warn("[hs-bridge] new_chat: failed to connect port:", e)
		return
	}

	port.onMessage.addListener((pmsg) => {
		if (pmsg.type === "new_chat_done") {
			console.log("[hs-bridge] new_chat done, chatId:", pmsg.chatId)
			if (ws && ws.readyState === WebSocket.OPEN) {
				// Notify VS Code that new chat is open — chat_id_changed will follow
			}
		}
		port.disconnect()
	})

	port.postMessage({ type: "new_chat", reqId })
}

async function handleAttachImage(msg) {
	const { id, data, mimeType } = msg
	const tab = await findDeepSeekTab("auto")
	if (!tab) {
		sendError(id, "tab_closed", "no chat.deepseek.com tab open")
		return
	}

	const reqId = id
	let port
	try {
		port = chrome.tabs.connect(tab.id, { name: `hs-cmd-${reqId}` })
	} catch (e) {
		sendError(id, "tab_closed", String(e))
		return
	}

	port.onMessage.addListener((pmsg) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			port.disconnect()
			return
		}
		if (pmsg.type === "attach_progress") {
			ws.send(JSON.stringify({ type: "attach_progress", id: reqId }))
		} else if (pmsg.type === "error") {
			sendError(id, "image_attach_failed", pmsg.detail || "")
		}
		port.disconnect()
	})

	port.postMessage({ type: "attach_image", reqId, data, mimeType })
}

function sendError(id, code, detail) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return
	try {
		ws.send(JSON.stringify({ type: "error", id, code, detail }))
	} catch (e) {
		/* ignore */
	}
}

// Popup queries the latest status via storage.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg && msg.type === "get_status") {
		sendResponse(lastStatus)
	} else if (msg && msg.type === "force_reconnect") {
		if (ws)
			try {
				ws.close()
			} catch (e) {
				/* ignore */
			}
		sendResponse({ ok: true })
	} else if (msg && msg.type === "chat_id_changed") {
		// Forwarded from content.js — relay to WS server
		const chatId = msg.chatId
		setStatus({ activeChatId: chatId })
		if (ws && ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify({ type: "chat_id_changed", chatId }))
			} catch (e) {
				/* ignore */
			}
		}
		sendResponse({ ok: true })
	}
	return true
})

// ── Bearer token extraction ──────────────────────────────────────────────────
// Reads localStorage.userToken from the active DeepSeek tab and sends it to
// the WS server so the direct web API approach can authenticate without DOM.

async function sendBearerTokenToServer() {
	if (!ws || ws.readyState !== WebSocket.OPEN) return

	const tab = await findDeepSeekTab()
	if (!tab) return

	let bearerToken = ""
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: "MAIN",
			func: () => {
				try {
					const raw = localStorage.getItem("userToken")
					if (!raw) return ""
					const parsed = JSON.parse(raw)
					return parsed?.value || parsed || ""
				} catch {
					return ""
				}
			},
		})
		bearerToken = results?.[0]?.result || ""
	} catch (e) {
		console.warn("[hs-bridge] Failed to extract bearer token:", e)
		return
	}

	if (!bearerToken) return

	// Also collect visible (non-HttpOnly) cookies from the page
	let cookies = ""
	try {
		const cookieResults = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: "MAIN",
			func: () => document.cookie,
		})
		cookies = cookieResults?.[0]?.result || ""
	} catch {
		/* ignore — cookies are optional, Bearer token + PoW is sufficient */
	}

	try {
		ws.send(JSON.stringify({ type: "token", bearerToken, cookies }))
		console.log("[hs-bridge] Bearer token sent to server, length:", bearerToken.length)
	} catch {
		/* ignore */
	}
}

connect()
