# Hybrid Synth — DeepSeek Bridge (Chrome Extension)

Loads `chat.deepseek.com` in your normal browser session, scrapes assistant
replies, and relays them to the local `hybrid_synth` FastAPI backend on
`ws://127.0.0.1:5000/ws/deepseek-bridge`.

## Install (Developer Mode)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** → select this `extension/` folder.
4. Pin the extension (puzzle icon → pin).
5. Open `https://chat.deepseek.com/` and sign in.
6. Start the backend: `python -m uvicorn src.api.server:app --port 5000`.
7. Click the extension icon — the dot should go green.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json`  | MV3 manifest (host permissions, service worker, content script) |
| `background.js`  | WebSocket client to backend, prompt dispatch, status store |
| `content.js`     | Injected into chat.deepseek.com — types prompt, observes reply |
| `popup.html/js`  | Status panel + force-reconnect button |
| `icon.png`       | (provide your own 128px PNG) |

## Protocol

Both directions speak JSON lines:

* Server → ext: `{type:"prompt", id, messages:[…], temperature, max_tokens}`
* Ext → server: `{type:"response", id, text, finish_reason, latency_ms}`
* Errors:       `{type:"error",    id, code, detail}` (codes: `tab_closed | parse_failed | rate_limited | timeout`)
* Heartbeat:    `{type:"ping"} / {type:"pong"}`

## Notes

* Only one active extension client is honoured at a time. Last connect wins.
* If DeepSeek's UI changes selectors, update `content.js` (TEXTAREA_SELECTORS,
  SEND_BUTTON_SELECTORS, MESSAGE_CANDIDATE_SELECTORS).
* This is an MV3 service-worker extension — workers go idle, but the
  WebSocket reconnect logic restores the bridge when activity returns.
