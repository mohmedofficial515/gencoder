// content.js — runs in ISOLATED world at document_start.
// Bridges streaming messages between background.js (chrome.runtime Port)
// and injected.js (window.postMessage in MAIN world).
// injected.js is loaded via manifest content_scripts with world:"MAIN" — no dynamic injection needed.

;(() => {
	// ── Bridge: chrome.runtime Port ↔ window.postMessage ─────────────────
	const FIRST_CHUNK_TIMEOUT = 115_000

	// Forward out-of-band events from injected.js → background.js (no port needed)
	window.addEventListener("message", (event) => {
		if (event.source !== window) return
		const data = event.data || {}

		// Chat-ID change — forward so background can relay to WS server
		if (data.type === "hs_chat_id_changed") {
			chrome.runtime.sendMessage({ type: "chat_id_changed", chatId: data.chatId }).catch(() => {})
			return
		}

		// New chat button was clicked by the user (not us) — inform VS Code
		if (data.type === "hs_new_chat_done" && !data._fromBridge) {
			// Only fire "new_chat_clicked" if this wasn't triggered by our own handler
			// (our handler sends hs_new_chat_done with reqId; user clicks don't have reqId)
		}
	})

	chrome.runtime.onConnect.addListener((port) => {
		if (!port.name.startsWith("hs-stream-") && !port.name.startsWith("hs-cmd-")) return

		const isCmd = port.name.startsWith("hs-cmd-")

		// ── Command port (new_chat, attach_image) ──────────────────────────
		if (isCmd) {
			port.onMessage.addListener(async (msg) => {
				if (!msg || !msg.type) return

				if (msg.type === "new_chat") {
					const reqId = msg.reqId || "nc"
					const handler = (event) => {
						if (event.source !== window) return
						const data = event.data || {}
						if ((data.type === "hs_new_chat_done" || data.type === "hs_error") && data.reqId === reqId) {
							window.removeEventListener("message", handler)
							port.postMessage({
								type: data.type === "hs_new_chat_done" ? "new_chat_done" : "error",
								chatId: data.chatId,
								detail: data.error,
							})
						}
					}
					window.addEventListener("message", handler)
					window.postMessage({ type: "hs_new_chat", reqId }, "*")
				}

				if (msg.type === "attach_image") {
					const reqId = msg.reqId
					const handler = (event) => {
						if (event.source !== window) return
						const data = event.data || {}
						if (data.reqId !== reqId) return
						if (data.type === "hs_attach_progress" || data.type === "hs_error") {
							window.removeEventListener("message", handler)
							port.postMessage({
								type: data.type === "hs_attach_progress" ? "attach_progress" : "error",
								reqId,
								detail: data.error,
							})
						}
					}
					window.addEventListener("message", handler)
					window.postMessage({ type: "hs_attach_image", reqId, data: msg.data, mimeType: msg.mimeType }, "*")
				}
			})

			port.onDisconnect.addListener(() => {})
			return
		}

		// ── Streaming port (submit_prompt) ─────────────────────────────────
		const reqId = Math.random().toString(36).slice(2) + Date.now().toString(36)
		let startedAt = 0
		let firstChunkTimer = null

		const msgHandler = (event) => {
			if (event.source !== window) return
			const data = event.data || {}
			if (data.reqId !== reqId) return

			switch (data.type) {
				case "hs_chunk":
					if (firstChunkTimer) {
						clearTimeout(firstChunkTimer)
						firstChunkTimer = null
					}
					port.postMessage({ type: "chunk", text: data.text })
					break
				case "hs_reasoning":
					port.postMessage({ type: "reasoning", text: data.text })
					break
				case "hs_done":
					port.postMessage({ type: "done", text: data.text, latencyMs: Date.now() - startedAt })
					cleanup()
					break
				case "hs_error":
					port.postMessage({ type: "error", code: "stream_error", detail: data.error })
					cleanup()
					break
			}
		}

		const cleanup = () => {
			window.removeEventListener("message", msgHandler)
			if (firstChunkTimer) {
				clearTimeout(firstChunkTimer)
				firstChunkTimer = null
			}
			try {
				port.disconnect()
			} catch (_) {}
		}

		port.onMessage.addListener((msg) => {
			if (!msg || msg.type !== "submit_prompt") return
			startedAt = Date.now()
			window.postMessage(
				{
					type: "hs_submit",
					reqId,
					text: msg.text,
					mode: msg.mode || "auto",
					options: msg.options || null,
				},
				"*",
			)
		})

		port.onDisconnect.addListener(cleanup)

		firstChunkTimer = setTimeout(() => {
			port.postMessage({ type: "error", code: "timeout", detail: "no_response" })
			cleanup()
		}, FIRST_CHUNK_TIMEOUT)

		window.addEventListener("message", msgHandler)
	})
})()
