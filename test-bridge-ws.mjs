#!/usr/bin/env node
/*
 * DeepSeek Bridge WS Test Script
 * Usage:
 *   1. Load the VS Code extension (F5) — starts bridge on port 9876
 *   2. Load the Chrome extension (C:\gencoder\extension)
 *   3. Open chat.deepseek.com and log in
 *   4. Activate the Chrome extension
 *   5. Run: node test-bridge-ws.mjs
 *
 * This script connects to the WS bridge as the VS Code handler would.
 * The Chrome extension must be connected first (for the bridge to relay).
 */

const PROTOCOL_VERSION = "0.1.0"
const WS_URL = "ws://127.0.0.1:9876/ws/deepseek-bridge"
const HTTP_STATUS = "http://127.0.0.1:9876/status"
const TEST_PROMPT = "Say exactly: 'Bridge test PASSED' and nothing else."

let ws = null
const reqMap = new Map()

// ── Step 1: check HTTP status ──────────────────────────────────────────────
async function checkStatus() {
	console.log("\n[1] Checking /status endpoint...")
	try {
		const res = await fetch(HTTP_STATUS)
		const data = await res.json()
		console.log(`    connected : ${data.connected}`)
		console.log(`    pending   : ${data.pending}`)
		console.log(`    lastError : ${data.lastError}`)
		if (!data.connected) {
			console.log("\n[!] Chrome extension NOT connected!")
			console.log("    Make sure:")
			console.log("      1. Chrome extension loaded from C:\\gencoder\\extension")
			console.log("      2. chat.deepseek.com is open and logged in")
			console.log("      3. Extension is active (check popup)")
			return false
		}
		return true
	} catch (e) {
		console.log(`[!] /status unreachable: ${e.message}`)
		console.log("    Is the VS Code extension running? (F5 in VS Code)")
		return false
	}
}

// ── Step 2: connect via WebSocket ──────────────────────────────────────────
function connectWS() {
	return new Promise((resolve, reject) => {
		console.log("\n[2] Connecting to WebSocket...")
		ws = new WebSocket(WS_URL)

		ws.onopen = () => {
			console.log("    WS connected!")
			resolve()
		}

		ws.onerror = (e) => {
			console.log(`    WS error: ${e.message}`)
		}

		ws.onclose = (e) => {
			console.log(`    WS closed: code=${e.code}`)
			ws = null
		}

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data.toString())
				handleMessage(msg)
			} catch (e) {
				console.log(`    Failed to parse message: ${e.message}`)
			}
		}

		setTimeout(() => reject(new Error("WS connection timeout")), 5000)
	})
}

// ── handle incoming WS messages ────────────────────────────────────────────
function handleMessage(msg) {
	if (msg.type === "ping") {
		// Respond to bridge heartbeats
		ws.send(JSON.stringify({ type: "pong" }))
		console.log("    ← ping/pong")
		return
	}

	if (msg.type === "prompt") {
		console.log(`\n    ← received prompt: id=${msg.id}, mode=${msg.mode}`)
		console.log(`    text (first 100): ${msg.text.slice(0, 100)}...`)

		// Simulate streaming response from Chrome extension
		let chunkIndex = 0
		const respText = `[Bridge test] Received your prompt of ${msg.text.length} chars. Test PASSED at ${new Date().toISOString()}`
		const words = respText.split(" ")

		const interval = setInterval(() => {
			if (chunkIndex >= words.length) {
				clearInterval(interval)
				ws.send(
					JSON.stringify({
						type: "done",
						id: msg.id,
						text: respText,
						finish_reason: "stop",
					}),
				)
				console.log(`    → sent done`)
				return
			}

			ws.send(
				JSON.stringify({
					type: "chunk",
					id: msg.id,
					text: words[chunkIndex] + " ",
				}),
			)
			chunkIndex++
		}, 50)
		return
	}

	console.log(`    ← unknown message:`, JSON.stringify(msg).slice(0, 200))
}

// ── Step 3: send prompt ────────────────────────────────────────────────────
function sendPrompt(text, mode = "auto") {
	return new Promise((resolve, reject) => {
		if (!ws) {
			reject(new Error("WS not connected"))
			return
		}

		const id = crypto.randomUUID()
		console.log(`\n[3] Sending prompt: id=${id}, mode=${mode}`)

		// Listen for done/error
		const origHandler = ws.onmessage
		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data.toString())
				if (msg.type === "done" && msg.id === id) {
					ws.onmessage = origHandler
					resolve(msg.text)
					return
				}
				if (msg.type === "error" && msg.id === id) {
					ws.onmessage = origHandler
					reject(new Error(`${msg.code}: ${msg.detail}`))
					return
				}
				// Fall through to handler for chunk/reasoning
				if (msg.type === "chunk" && msg.id === id) {
					process.stdout.write(msg.text)
				}
				if (msg.type === "reasoning" && msg.id === id) {
					process.stdout.write(`\x1b[90m${msg.text}\x1b[0m`)
				}
			} catch (e) {}

			// Pass through for non-matching messages
		}

		ws.send(
			JSON.stringify({
				type: "prompt",
				id,
				text,
				mode,
			}),
		)
	})
}

// ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
async function main() {
	console.log("╔════════════════════════════════════════╗")
	console.log("║   DeepSeek Bridge — Test Suite         ║")
	console.log("╚════════════════════════════════════════╝")

	const connected = await checkStatus()
	if (!connected) {
		console.log("\n[!] Test ABORTED — extension not connected")
		process.exit(1)
	}

	try {
		await connectWS()
	} catch (e) {
		console.log(`[!] ${e.message}`)
		process.exit(1)
	}

	try {
		const response = await sendPrompt(TEST_PROMPT)
		console.log(`\n\n[4] Final response (first 200 chars):`)
		console.log(`    ${response.slice(0, 200)}`)
		console.log(`\n\x1b[32m✓ TEST PASSED\x1b[0m — Full bridge loop verified!`)
	} catch (e) {
		console.log(`\n\x1b[31m✗ TEST FAILED\x1b[0m: ${e.message}`)
		process.exit(1)
	}

	ws.close()
	process.exit(0)
}

main()
