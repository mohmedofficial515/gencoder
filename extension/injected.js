// injected.js — runs in MAIN world via manifest content_scripts (world:"MAIN").
// Has access to window.fetch for network interception.
// Communicates with content.js (isolated world) via window.postMessage.

;(() => {
	const HARD_TIMEOUT_MS = 110_000
	const SEND_DELAY_MS = 80

	const TEXTAREA_SELECTORS = [
		"textarea#chat-input",
		"textarea[placeholder]",
		'div[contenteditable="true"][role="textbox"]',
		"textarea",
	]
	const SEND_BUTTON_SELECTORS = [
		'button[aria-label="Send" i]',
		'button[type="submit"]',
		'div[role="button"][aria-label*="end" i]',
	]

	// Selectors for chat-page mode controls — update here when deepseek.com restyling breaks them
	const MODE_SELECTORS = {
		deepThinkButton: [
			// Try text content match first (most reliable for DeepSeek's current UI)
			"#chat-input ~ * button",
			'button[class*="think"]',
			'button[class*="deepthink" i]',
			'button[aria-label*="DeepThink" i]',
			'button[aria-label*="deep think" i]',
			'button[title*="DeepThink" i]',
			'div[class*="toolbar"] button:first-child',
		],
		searchButton: [
			'button[class*="search"]',
			'button[aria-label*="Search" i]',
			'button[title*="Search" i]',
			'div[class*="toolbar"] button:nth-child(2)',
		],
		expertTab: [
			'div[class*="mode"] button:last-child',
			'button[class*="expert" i]',
			'button[aria-label*="Expert" i]',
			'[role="tab"]:last-child',
		],
		instantTab: [
			'div[class*="mode"] button:first-child',
			'button[class*="instant" i]',
			'button[aria-label*="Instant" i]',
			'[role="tab"]:first-child',
		],
		newChatButton: [
			'button[aria-label*="New chat" i]',
			'a[href="/"][aria-label*="new" i]',
			'button[class*="new"][class*="chat" i]',
			'[data-testid*="new-chat"]',
		],
		attachmentPreview: [
			'img[src^="blob:"]',
			'[data-testid*="attachment"]',
			'[class*="preview"][class*="image"]',
			'[class*="image-preview"]',
		],
	}

	// ── Fetch intercept ───────────────────────────────────────────────────────
	const _pending = new Map()

	console.log("[hs-bridge] injected.js loaded, hooks installing")

	// ── Chat-ID watcher ───────────────────────────────────────────────────────
	// Monitors location.pathname for deepseek chat ID changes and notifies
	// the VS Code extension so it can reset its stateful session if needed.
	let _lastChatId = extractChatId(location.pathname)

	function extractChatId(pathname) {
		const m = pathname.match(/\/(?:chat\/)?s\/([0-9a-f-]{36})/i)
		return m ? m[1] : null
	}

	const _navObserver = new MutationObserver(() => {
		const current = extractChatId(location.pathname)
		if (current !== _lastChatId) {
			_lastChatId = current
			window.postMessage({ type: "hs_chat_id_changed", chatId: current ?? "" }, "*")
		}
	})
	_navObserver.observe(document.documentElement, { subtree: false, childList: true })

	// Also hook pushState / replaceState for SPA navigation
	for (const method of ["pushState", "replaceState"]) {
		const orig = history[method].bind(history)
		history[method] = (...args) => {
			const ret = orig(...args)
			const current = extractChatId(location.pathname)
			if (current !== _lastChatId) {
				_lastChatId = current
				window.postMessage({ type: "hs_chat_id_changed", chatId: current ?? "" }, "*")
			}
			return ret
		}
	}

	// ── XHR intercept (in case DeepSeek uses XMLHttpRequest, not fetch) ──────
	const _origXhrOpen = XMLHttpRequest.prototype.open
	const _origXhrSend = XMLHttpRequest.prototype.send

	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		this.__hs_method = method
		this.__hs_url = url
		return _origXhrOpen.call(this, method, url, ...rest)
	}

	XMLHttpRequest.prototype.send = function (body) {
		if (_pending.size > 0) {
			console.log("[hs-bridge] XHR seen while pending:", this.__hs_method, this.__hs_url)
		}
		if (_pending.size > 0 && (this.__hs_method || "").toUpperCase() === "POST") {
			const url = this.__hs_url || ""
			// Match any POST that looks like a completion/streaming endpoint
			if (/\/completion|\/chat\/complete|\/message|\/generate|\/stream/i.test(url)) {
				console.log("[hs-bridge] XHR INTERCEPTING:", url)
				const [reqId, capture] = _pending.entries().next().value
				_pending.delete(reqId)
				clearTimeout(capture.timeoutId)

				let lastIndex = 0
				let prevRespLen = 0
				let prevReasLen = 0
				const parser = createSSEParser((resp, reas) => {
					if (resp.length > prevRespLen) {
						const delta = resp.slice(prevRespLen)
						prevRespLen = resp.length
						if (delta) window.postMessage({ type: "hs_chunk", reqId, text: delta }, "*")
					}
					if (reas.length > prevReasLen) {
						const delta = reas.slice(prevReasLen)
						prevReasLen = reas.length
						if (delta) window.postMessage({ type: "hs_reasoning", reqId, text: delta }, "*")
					}
				})

				this.addEventListener("readystatechange", () => {
					if (this.readyState >= 3) {
						let text
						try {
							text = this.responseText
						} catch (e) {
							console.warn("[hs-bridge] XHR responseText error (state " + this.readyState + "):", e.message)
							if (this.readyState === 4) {
								console.log(
									"[hs-bridge] XHR done (responseText unavailable), captured",
									parser.getText().length,
									"chars",
								)
								capture.resolve(parser.getText())
							}
							return
						}
						const newText = text.slice(lastIndex)
						lastIndex = text.length
						if (newText) parser.feed(newText)
					}
					if (this.readyState === 4) {
						console.log("[hs-bridge] XHR done, captured", parser.getText().length, "chars")
						capture.resolve(parser.getText())
					}
				})
			}
		}
		return _origXhrSend.call(this, body)
	}

	// ── Fetch intercept ─────────────────────────────────────────────────────
	const _origFetch = window.fetch.bind(window)
	window.fetch = async (...args) => {
		const url = (typeof args[0] === "string" ? args[0] : args[0]?.url) || ""
		const init = args[1] || {}
		const method = (init.method || (args[0] instanceof Request ? args[0].method : "GET")).toUpperCase()

		if (_pending.size > 0) {
			console.log("[hs-bridge] fetch seen while pending:", method, url)
		}

		const isCandidate = _pending.size > 0 && method === "POST"

		if (isCandidate) {
			let resp
			try {
				resp = await _origFetch(...args)
			} catch (e) {
				const [reqId, capture] = _pending.entries().next().value
				_pending.delete(reqId)
				clearTimeout(capture.timeoutId)
				capture.reject(e.message || String(e))
				throw e
			}

			const ctype = resp.headers.get("content-type") || ""
			const isEventStream = /text\/event-stream/i.test(ctype)
			// Capture if SSE stream (by content-type) OR URL contains completion patterns
			const isCompletionUrl = /\/completion|\/chat\/complete|\/message|\/generate|\/stream/i.test(url)
			console.log("[hs-bridge] POST response url=", url, "ctype=", ctype, "isSSE=", isEventStream)

			if (resp.body && (isEventStream || isCompletionUrl)) {
				const [reqId, capture] = _pending.entries().next().value
				_pending.delete(reqId)
				clearTimeout(capture.timeoutId)
				console.log("[hs-bridge] INTERCEPTING:", url, "for", reqId)

				const [streamForPage, streamForUs] = resp.body.tee()
				readSSE(streamForUs, reqId)
					.then((text) => {
						console.log("[hs-bridge] captured", text.length, "chars:", text.slice(0, 80))
						capture.resolve(text)
					})
					.catch((e) => capture.reject(e.message || String(e)))

				return new Response(streamForPage, {
					status: resp.status,
					statusText: resp.statusText,
					headers: resp.headers,
				})
			}

			return resp
		}

		return _origFetch(...args)
	}

	function createSSEParser(onDelta) {
		let buf = ""
		let curPath = null
		let curOp = "APPEND"
		let inResponseFrag = false
		let inReasoningFrag = false
		let responseText = ""
		let reasoningText = ""
		let _dbg = 0

		const handle = (obj) => {
			// Log first 8 SSE events so we can see DeepSeek's actual format
			if (_dbg < 8) {
				console.log("[hs-bridge] SSE[" + _dbg + "]:", JSON.stringify(obj).slice(0, 400))
				_dbg++
			}

			// Format A: full snapshot — {v:{response:{fragments:[{type,content}]}}}
			if (obj?.v?.response?.fragments && Array.isArray(obj.v.response.fragments)) {
				const frags = obj.v.response.fragments
				for (const f of frags) {
					if (f.type === "RESPONSE" && f.content) responseText += f.content
					if (f.type === "REASONING" && f.content) reasoningText += f.content
				}
				return
			}

			// Format B: OpenAI-style delta — {choices:[{delta:{content|text|reasoning_content}}]}
			if (Array.isArray(obj?.choices) && obj.choices[0]?.delta !== undefined) {
				const d = obj.choices[0].delta
				if (typeof d.content === "string") responseText += d.content
				if (typeof d.text === "string") responseText += d.text
				if (typeof d.reasoning_content === "string") reasoningText += d.reasoning_content
				if (typeof d.thinking_content === "string") reasoningText += d.thinking_content
				return
			}

			// JSON-patch style: update path and op (normalize op to UPPERCASE)
			if (obj.p !== undefined) curPath = obj.p
			if (obj.o !== undefined) curOp = String(obj.o).toUpperCase()

			// Format C: fragment append — {p:"response/fragments", o:"APPEND", v:[{type,content}]}
			const normPath = (curPath || "").replace(/^\//, "") // strip leading slash
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

			// Format D: content delta — {p:"response/fragments/-1/content", v:"chunk"}
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
					// No fragment type set yet — assume response
					responseText += obj.v
				}
				return
			}

			// Format E: choices path delta — {p:"choices/0/delta/text", v:"chunk"}
			if (
				typeof obj.v === "string" &&
				normPath &&
				/^(choices\/\d+\/delta\/(text|content)|message\/content)$/.test(normPath)
			) {
				responseText += obj.v
				return
			}

			// Format E2: thinking/reasoning via path
			if (
				typeof obj.v === "string" &&
				normPath &&
				/^choices\/\d+\/delta\/(thinking_content|reasoning_content)$/.test(normPath)
			) {
				reasoningText += obj.v
				return
			}
		}

		return {
			feed(chunk) {
				buf += chunk
				let nl
				while ((nl = buf.indexOf("\n")) !== -1) {
					const line = buf.slice(0, nl).trimEnd()
					buf = buf.slice(nl + 1)
					if (!line.startsWith("data:")) continue
					const raw = line.slice(5).trim()
					if (!raw || raw === "[DONE]") continue
					try {
						handle(JSON.parse(raw))
					} catch (_) {}
				}
				if (onDelta) onDelta(responseText, reasoningText)
			},
			getText: () => responseText.trim(),
			getReasoning: () => reasoningText.trim(),
		}
	}

	async function readSSE(stream, reqId) {
		const reader = stream.getReader()
		const decoder = new TextDecoder()
		let prevRespLen = 0
		let prevReasLen = 0
		const parser = createSSEParser((resp, reas) => {
			if (resp.length > prevRespLen) {
				const delta = resp.slice(prevRespLen)
				prevRespLen = resp.length
				if (delta) window.postMessage({ type: "hs_chunk", reqId, text: delta }, "*")
			}
			if (reas.length > prevReasLen) {
				const delta = reas.slice(prevReasLen)
				prevReasLen = reas.length
				if (delta) window.postMessage({ type: "hs_reasoning", reqId, text: delta }, "*")
			}
		})
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			parser.feed(decoder.decode(value, { stream: true }))
		}
		return parser.getText()
	}

	console.log("[hs-bridge] all hooks installed (fetch + XHR)")

	// ── DOM helpers ───────────────────────────────────────────────────────────

	function findFirst(selectors) {
		for (const sel of selectors) {
			try {
				const el = document.querySelector(sel)
				if (el) return el
			} catch (_) {}
		}
		return null
	}

	// Find a button/element by its visible text (case-insensitive partial match)
	function findByText(tag, text) {
		const lc = text.toLowerCase()
		const els = document.querySelectorAll(tag)
		for (const el of els) {
			const t = (el.textContent || el.innerText || "").trim().toLowerCase()
			if (t === lc || t.startsWith(lc)) return el
		}
		return null
	}

	function setReactInputValue(el, value) {
		if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
			const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
			const setter = Object.getOwnPropertyDescriptor(proto, "value").set
			setter.call(el, value)
			el.dispatchEvent(new Event("input", { bubbles: true }))
			el.dispatchEvent(new Event("change", { bubbles: true }))
		} else {
			el.focus()
			el.textContent = value
			el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }))
		}
	}

	function clickSend() {
		const btn = findFirst(SEND_BUTTON_SELECTORS)
		if (btn) {
			btn.click()
			return true
		}
		const ta = findFirst(TEXTAREA_SELECTORS)
		if (ta) {
			ta.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Enter",
					code: "Enter",
					keyCode: 13,
					which: 13,
					bubbles: true,
					cancelable: true,
				}),
			)
			return true
		}
		return false
	}

	function sleep(ms) {
		return new Promise((r) => setTimeout(r, ms))
	}

	// Detect whether a button is in the "active/on" state
	function isButtonActive(btn) {
		if (!btn) return false
		return (
			btn.getAttribute("aria-pressed") === "true" ||
			btn.getAttribute("data-state") === "on" ||
			btn.getAttribute("data-active") === "true" ||
			btn.classList.contains("active") ||
			btn.classList.contains("selected") ||
			btn.classList.contains("is-active")
		)
	}

	// Ensure mode buttons are in the desired state before sending
	async function ensureModeState(options) {
		if (!options) return
		const { deepThink, search, responseMode } = options

		// Helper: find mode button by text content first, then CSS selectors
		function findModeBtn(textLabels, cssSelectors) {
			for (const label of textLabels) {
				const el = findByText("button", label) || findByText("div[role='button']", label)
				if (el) return el
			}
			return findFirst(cssSelectors)
		}

		// DeepThink toggle
		const dtBtn = findModeBtn(["DeepThink", "深度思考", "deep think"], MODE_SELECTORS.deepThinkButton)
		if (dtBtn) {
			const isOn = isButtonActive(dtBtn)
			if (!!deepThink !== isOn) {
				dtBtn.click()
				await sleep(80)
			}
		} else if (deepThink) {
			console.warn("[Bridge] DeepThink button not found — selector may need updating")
		}

		// Search toggle
		const srBtn = findModeBtn(["Search", "搜索", "联网搜索"], MODE_SELECTORS.searchButton)
		if (srBtn) {
			const isOn = isButtonActive(srBtn)
			if (!!search !== isOn) {
				srBtn.click()
				await sleep(80)
			}
		} else if (search) {
			console.warn("[Bridge] Search button not found — selector may need updating")
		}

		// Instant / Expert tab — find by text content
		if (responseMode === "expert") {
			const expertBtn = findModeBtn(["Expert", "专家版"], MODE_SELECTORS.expertTab)
			if (expertBtn && !isButtonActive(expertBtn)) {
				expertBtn.click()
				await sleep(80)
			}
		} else if (responseMode === "instant") {
			const instantBtn = findModeBtn(["Instant", "极速版", "快速"], MODE_SELECTORS.instantTab)
			if (instantBtn && !isButtonActive(instantBtn)) {
				instantBtn.click()
				await sleep(80)
			}
		}
	}

	// Attach an image (base64) to the chat textarea
	// Tries clipboard paste first, then file-input injection as fallback
	async function attachImage(reqId, base64Data, mimeType) {
		function base64ToBlob(b64, type) {
			const binary = atob(b64)
			const bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
			return new Blob([bytes], { type })
		}

		function extForMime(mime) {
			if (mime.includes("png")) return "png"
			if (mime.includes("gif")) return "gif"
			if (mime.includes("webp")) return "webp"
			return "jpg"
		}

		function isAttachmentVisible() {
			return !!findFirst(MODE_SELECTORS.attachmentPreview)
		}

		const blob = base64ToBlob(base64Data, mimeType)
		const fileName = `image.${extForMime(mimeType)}`

		// Method A: paste simulation
		const ta = findFirst(TEXTAREA_SELECTORS)
		if (ta) {
			try {
				const dt = new DataTransfer()
				dt.items.add(new File([blob], fileName, { type: mimeType }))
				ta.focus()
				ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
				await sleep(600)
				if (isAttachmentVisible()) {
					window.postMessage({ type: "hs_attach_progress", reqId }, "*")
					return
				}
			} catch (e) {
				console.warn("[Bridge] Paste method failed:", e)
			}
		}

		// Method B: file input injection
		const fileInput =
			document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]')
		if (fileInput) {
			try {
				const dt2 = new DataTransfer()
				dt2.items.add(new File([blob], fileName, { type: mimeType }))
				Object.defineProperty(fileInput, "files", { value: dt2.files, configurable: true })
				fileInput.dispatchEvent(new Event("change", { bubbles: true }))
				await sleep(800)
				if (isAttachmentVisible()) {
					window.postMessage({ type: "hs_attach_progress", reqId }, "*")
					return
				}
			} catch (e) {
				console.warn("[Bridge] File-input method failed:", e)
			}
		}

		// Both methods failed
		window.postMessage({ type: "hs_error", reqId, error: "image_attach_failed" }, "*")
	}

	// ── "New Chat" handler ────────────────────────────────────────────────────

	async function handleNewChat(reqId) {
		// Try clicking the "New chat" button
		const btn = findFirst(MODE_SELECTORS.newChatButton)
		if (btn) {
			btn.click()
			await sleep(300)
			window.postMessage({ type: "hs_new_chat_done", reqId, chatId: extractChatId(location.pathname) ?? "" }, "*")
			return
		}
		// Fallback: navigate to root which opens a fresh chat
		history.pushState({}, "", "/")
		window.dispatchEvent(new PopStateEvent("popstate"))
		await sleep(500)
		window.postMessage({ type: "hs_new_chat_done", reqId, chatId: extractChatId(location.pathname) ?? "" }, "*")
	}

	// ── Message bridge (from isolated content.js) ─────────────────────────────

	window.addEventListener("message", async (event) => {
		if (event.source !== window) return
		if (!event.data || !event.data.type) return

		const { type, reqId } = event.data

		// Image attachment request
		if (type === "hs_attach_image") {
			await attachImage(reqId, event.data.data, event.data.mimeType)
			return
		}

		// New chat request
		if (type === "hs_new_chat") {
			await handleNewChat(reqId || "")
			return
		}

		// Normal chat submission
		if (type !== "hs_submit") return

		const { text, mode, options } = event.data
		const isVisible = mode === "visible"

		const ta = findFirst(TEXTAREA_SELECTORS)
		if (!ta) {
			window.postMessage({ type: "hs_error", reqId, error: "textarea_not_found" }, "*")
			return
		}

		if (isVisible) {
			try {
				ta.scrollIntoView({ behavior: "auto", block: "center" })
			} catch (_) {}
		}

		// Ensure mode buttons are in the right state before submitting
		await ensureModeState(options)

		const capturePromise = new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				_pending.delete(reqId)
				reject(new Error("fetch_not_intercepted_timeout"))
			}, HARD_TIMEOUT_MS)
			_pending.set(reqId, { resolve, reject, timeoutId })
		})

		setReactInputValue(ta, text)
		await sleep(SEND_DELAY_MS)

		if (!clickSend()) {
			_pending.delete(reqId)
			window.postMessage({ type: "hs_error", reqId, error: "send_button_not_found" }, "*")
			return
		}

		try {
			const result = await capturePromise
			if (isVisible) {
				try {
					const scroller =
						document.querySelector('[class*="chat"][class*="scroll"]') ||
						document.scrollingElement ||
						document.documentElement
					scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
				} catch (_) {}
			}
			window.postMessage({ type: "hs_done", reqId, text: result }, "*")
		} catch (e) {
			window.postMessage({ type: "hs_error", reqId, error: e.message || String(e) }, "*")
		}
	})
})()
