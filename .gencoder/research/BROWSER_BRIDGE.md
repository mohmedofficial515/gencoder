# Browser Bridge (DeepSeek Chrome Extension) — Competitive Analysis
> Maintained by `research-feature-analyst`. Last updated: 2026-05-11.
> Sources verified this revision: `extension/manifest.json`, `extension/background.js` (366 LOC, mtime 2026-05-11), `extension/content.js` (147 LOC), `extension/injected.js` (671 LOC), `extension/popup.html` (74 LOC), `extension/popup.js` (41 LOC), `extension/README.md` (43 LOC), `src/core/api/providers/deepseek-bridge/ws-server.ts` (356 LOC), `src/core/api/providers/deepseek-bridge/index.ts` (218 LOC), `src/extension.ts:81-87`, repo-root `test-bridge-ws.mjs` (211 LOC) + `test_bridge.py` (70 LOC), prior doc `.gencoder/research/API_PROVIDERS.md`.

## 1. Overview / نظرة عامة

The Browser Bridge is a **Chrome (MV3) extension** at `extension/` that turns a logged-in `chat.deepseek.com` browser tab into a free, agent-controllable LLM endpoint for the VS Code extension. It is GenCoder's second-most-distinctive fork delta after the custom API providers (and the underlying transport that makes the `deepseek-bridge` provider work). The pipeline is: VS Code extension boots a localhost WebSocket server on port 9876 (`src/extension.ts:81-87`); the Chrome extension's MV3 service worker connects to it, then injects code into `chat.deepseek.com` that intercepts `fetch`/`XHR` SSE streams, parses five different DeepSeek payload shapes, and relays text + reasoning chunks back over WebSocket to the agent loop. The extension also harvests the page's `localStorage.userToken` bearer and forwards it so the sibling `deepseek-webapi` provider can talk to DeepSeek directly without DOM scraping when that path is preferred.

Strategically: this is the mechanism that lets GenCoder advertise "free DeepSeek V3/R1 in an agent loop with 131k context, no API key" — a positioning none of Cursor/Windsurf/Copilot/Cline upstream can match, because they all assume paid API access or BYO key.

## 2. Current State in GenCoder / الوضع الحالي

- **Entry points**:
  - `extension/manifest.json:1-57` — MV3 manifest, name "GenCoder — DeepSeek Bridge" v0.4.2; permissions `storage`, `tabs`, `scripting`; host permissions `https://chat.deepseek.com/*`, `http://127.0.0.1:9876/*`, `ws://127.0.0.1:9876/*`.
  - `extension/background.js:6-7` — `WS_URL = "ws://127.0.0.1:9876/ws/deepseek-bridge"`, hard-coded.
  - `extension/background.js:90-157` — `connect()` WebSocket lifecycle, reconnect backoff `[1000, 2000, 5000, 10000, 30000]` ms (line 7), 20 s heartbeat ping (line 8).
  - `extension/content.js:1-147` — runs in the **isolated** world; bridges `chrome.runtime` Port ↔ `window.postMessage`. First-chunk timeout 115 s (`content.js:8`).
  - `extension/injected.js:5-671` — runs in the **MAIN** world (`manifest.json:29`) so it can monkey-patch `window.fetch` and `XMLHttpRequest.prototype.{open,send}`. Hard timeout 110 s, 80 ms send delay (`injected.js:6-7`).
  - `src/core/api/providers/deepseek-bridge/ws-server.ts:6-8` — server side: `PORT = 9876`, path `/ws/deepseek-bridge`, 120 s request timeout, 8 s attach-image timeout.
  - `src/core/api/providers/deepseek-bridge/index.ts:70-217` — the `ApiHandler` consumer of the bridge; delta-sending session machine.

- **Wiring** (request flow):
  1. VS Code activates → `startBridgeServer()` (`src/extension.ts:83`) opens an HTTP+WS server on `127.0.0.1:9876`.
  2. User clicks Load Unpacked in `chrome://extensions` → MV3 service worker `background.js` connects; sends `{type:"hello", role:"extension", version:"0.4.0", tab_url}` (`background.js:107-118`).
  3. Server replies `{type:"ack"}` and `{type:"request_token"}` (`ws-server.ts:194-200, 309`).
  4. Service worker runs `chrome.scripting.executeScript` against the DeepSeek tab, reads `localStorage.userToken`, sends `{type:"token", bearerToken, cookies}` back (`background.js:314-362`). This token is what `deepseek-webapi/handler.ts` uses for the direct-API path.
  5. Agent loop calls `sendPrompt(text, mode, onChunk, onReasoning, opts)` (`ws-server.ts:73-131`) — server emits `{type:"prompt", id, text, mode, delta, sessionId, options:{deepThink,search,responseMode}}`.
  6. `background.js:159-209` finds a DeepSeek tab via three-tier fallback (`active+focused → active+anywhere → most-recent-by-lastAccessed`), opens a `chrome.tabs.connect` Port (`hs-stream-{id}`), forwards `submit_prompt` to `content.js`.
  7. `content.js:81-145` translates Port → `window.postMessage({type:"hs_submit", reqId, text, mode, options})`.
  8. `injected.js:599-670` receives `hs_submit`, calls `ensureModeState(options)` to toggle DeepThink/Search/Expert tabs, registers `_pending.set(reqId, …)`, sets the React-controlled `<textarea>` via the prototype `value` setter (`injected.js:406-418`), clicks Send.
  9. DeepSeek's own `fetch(POST /completion …)` fires; the monkey-patched `window.fetch` (`injected.js:175-229`) `.tee()`s the response body, streams half to the page (so the UI still renders) and half to `readSSE()` which feeds `createSSEParser` (`injected.js:231-354`).
  10. The parser handles **five SSE schemas**: Format A `{v:{response:{fragments:[...]}}}`, Format B OpenAI-style `{choices:[{delta:{content|text|reasoning_content}}]}`, Format C JSON-patch fragment append `{p:"response/fragments", o:"APPEND", v:[...]}`, Format D content delta `{p:".../-1/content", v:"..."}`, Format E choices-path delta. Each chunk → `window.postMessage({type:"hs_chunk"|"hs_reasoning"|"hs_done", reqId, text})`.
  11. Path back: injected → content → Port → background → WebSocket → `ws-server.ts` `pending.get(id)` → `ApiStream` yields to agent.

- **User-facing surface**:
  - Install: **manual "Load unpacked"** from `chrome://extensions` (`extension/README.md:7-12`). No Chrome Web Store listing.
  - Popup (`extension/popup.html` + `popup.js`): dark-themed 280px panel showing connection dot, active tab id, last-message age, last error, "Force reconnect" button. Refreshes every 1.5 s via `chrome.storage.local` (`popup.js:42`).
  - VS Code side: provider appears in dropdown as "DeepSeek (Free Bridge)" (per prior `API_PROVIDERS.md` §2), positioned first in `providers.json`. Status surfaces via `getBridgeStatus()` (`ws-server.ts:65-71`) and HTTP `GET /status` (`ws-server.ts:264-275`).

- **Out-of-band events** (extension-initiated, not request/response):
  - `chat_id_changed` — `injected.js:73-101` watches `location.pathname` for `/s/{uuid}` changes via `MutationObserver` + `pushState`/`replaceState` hooks; bubbles up through content → background → WS → `bridgeBus` (`ws-server.ts:213-217`).
  - `context_lost` — emitted to handler when `chat_id_changed` indicates the user navigated away; handler resets `sessionId` and re-sends full history (`index.ts:80-96, 108-114`).
  - `new_chat_clicked` — placeholder in `content.js:23-26` but **not wired** for user-initiated clicks (a `⚠ unverified gap`).
  - `attach_progress` — image-attach acknowledgement (`ws-server.ts:231-234`, `injected.js:516-577`).

- **Image attachment** (`injected.js:516-577`):
  - Method A: synthesize `ClipboardEvent("paste")` with `DataTransfer` carrying the base64 blob.
  - Method B fallback: locate `input[type="file"][accept*="image"]`, set `files` via `Object.defineProperty`, dispatch `change`.
  - Success detected by polling `attachmentPreview` selectors (`injected.js:57-62`).

- **Tests**: ❌ **No automated coverage of the bridge protocol or `injected.js` parser.** The two repo-root files are manual smoke harnesses:
  - `test-bridge-ws.mjs` (211 LOC, mtime 2026-05-10) — Node script that connects to ws://127.0.0.1:9876/ws/deepseek-bridge and sends a sample prompt.
  - `test_bridge.py` (70 LOC, mtime 2026-05-10) — Python equivalent; also stand-alone.
  - Neither runs in CI; neither exercises the five SSE format branches.

- **Singleton invariant**: `ws-server.ts:283-285` explicitly closes the previous `extensionWs` on a new connection (`README.md:38`: "Last connect wins"). Only one VS Code window or one Chrome profile can be the active bridge consumer at a time.

## 3. Advantages / المميزات الحالية

- ✅ **Free DeepSeek V3/R1 with full 131k context inside an agent loop**, with no API key, no credit card, no rate plan — *why it matters*: undercuts Cursor/Windsurf/Copilot on cost-to-zero. *Evidence*: `extension/manifest.json:1-15` + `src/core/api/providers/deepseek-bridge/index.ts:10-19`.
- ✅ **Real-browser session sidesteps Cloudflare / PoW / captcha** — DeepSeek's PoW challenge and any bot-detection middleware see a normal logged-in Chrome tab, not a headless scraper. *Why it matters*: server-side proxy alternatives (deep-proxy, deepseek4free) periodically break when DeepSeek tightens its anti-abuse stack; the in-browser bridge survives most of those changes by construction. *Evidence*: `injected.js:174-229` (in-page `fetch` interception, no out-of-band auth needed).
- ✅ **Five-format SSE parser is unusually robust** — handles DeepSeek's current JSON-patch fragment stream plus OpenAI-compat shapes plus full-snapshot shapes, so a single backend schema change rarely takes the whole pipeline down. *Evidence*: `injected.js:231-333`.
- ✅ **Separates RESPONSE vs REASONING streams natively**, so DeepThink chain-of-thought renders as agent "reasoning" in the VS Code UI. *Evidence*: `injected.js:262-264, 285-291`.
- ✅ **Stream tee'ing keeps DeepSeek's own UI live** — `resp.body.tee()` (`injected.js:210`) means the user still sees their page render normally while we capture, which avoids tipping off DeepSeek's heuristics and lets the user verify what the agent is doing. *Evidence*: `injected.js:210-222`.
- ✅ **Out-of-band session-recovery bus** — `bridgeBus.on("chat_id_changed" | "context_lost" | "new_chat_clicked")` (`ws-server.ts:213-229`, `index.ts:80-102`) means if the user manually clicks around in the DeepSeek tab, the agent state self-heals on next call.
- ✅ **MV3 service-worker reconnect logic** — exponential backoff `[1, 2, 5, 10, 30] s` plus 20 s heartbeats keeps the bridge alive across worker sleep cycles (`background.js:7-8, 64-88`).
- ✅ **DOM-state guardrails** — `ensureModeState()` reads `aria-pressed`/`data-state`/`active` class signals before toggling DeepThink/Search to avoid double-clicking when the desired state is already set (`injected.js:448-512`).
- ✅ **Bearer-token piggyback** — the same extension also supplies the `localStorage.userToken` to `ws-server.ts`, enabling the sibling `deepseek-webapi` direct-HTTP path as a faster fallback that doesn't need DOM scraping (`background.js:314-362`).

## 4. Disadvantages & Gaps / العيوب والثغرات

- ⚠ **Hard-coded port 9876, no discovery or fallback** — *impact*: two VS Code windows can't co-exist (`EADDRINUSE` silently swallows on line `ws-server.ts:316-322`; the second window's bridge attempts to start, fails, and no UI surfaces the conflict). Also conflicts with any other service that happens to grab 9876. *Evidence*: `ws-server.ts:6`, `background.js:6`, `manifest.json:13-14`.
- ⚠ **Single-tenant WebSocket** — *impact*: connecting a second Chrome profile or VS Code window kicks the previous one off without warning (`ws-server.ts:283-285`). No team/multi-window scenario supported. *Evidence*: `ws-server.ts:283-285`, `README.md:38`.
- ⚠ **No Chrome Web Store / Edge Add-ons listing** — *impact*: every user must enable Developer Mode, download the `extension/` folder, and Load Unpacked. Massive onboarding friction; also forfeits auto-update. *Evidence*: `extension/README.md:7-12` (manual install instructions); no `web_store_id` field anywhere.
- ⚠ **Brittle DOM selectors** — `injected.js:9-63` lists CSS selectors for textarea, send button, DeepThink, Search, Expert/Instant tabs, new-chat button, attachment preview. The DeepThink fallback (`'div[class*="toolbar"] button:first-child'`) is positional and will silently click the wrong button if DeepSeek rearranges. *Impact*: when DeepSeek redesigns (which they have done several times in 2025–2026), the bridge sends prompts but never DeepThinks, or worse, clicks an unrelated button. *Evidence*: `injected.js:21-63`. No version tag on selectors; no graceful-degradation telemetry; the warnings (`console.warn("[Bridge] DeepThink button not found")`) only surface to the user if they open DevTools.
- ⚠ **No automated test of the SSE parser** — `injected.js:231-354` has five branching format handlers with hand-tested fallthrough. *Impact*: any DeepSeek schema change (a sixth format, a renamed `RESPONSE`/`REASONING` enum, a `[DONE]` sentinel change) will silently truncate output. *Evidence*: no `*.test.ts` files in `extension/` (extension folder is JS-only, not in the TS build). `test-bridge-ws.mjs` and `test_bridge.py` are smoke scripts, not unit tests.
- ⚠ **Chrome / Chromium only — Firefox unsupported** — MV3 manifest with `service_worker` and `world: "MAIN"` content scripts is mostly Chromium-specific. Edge is Chromium-based so it likely works (per `extension/README.md:9` parenthetical) but is **⚠ unverified** in CI. Firefox MV3 has incomplete `world: "MAIN"` support and would need a polyfill. *Impact*: locks out the entire Firefox user base. *Evidence*: `manifest.json:16-42`, no Firefox-specific manifest variant.
- ⚠ **Heartbeat only one-way (extension → server)** — `background.js:70-80` pings every 20 s but `ws-server.ts:210` just consumes `pong` without ever asserting it. *Impact*: if the WebSocket appears OPEN but the service worker has died, server keeps queuing prompts that will time out at 120 s (`ws-server.ts:8`). *Evidence*: `ws-server.ts:65-71` `getBridgeStatus()` only reflects `readyState`, not last-heard-from time.
- ⚠ **DeepSeek ToS / account-suspension risk** — programmatically driving a logged-in account at agent-loop pace likely violates DeepSeek's Terms; no rate limiting on the bridge side (`ws-server.ts` has request timeout but no per-account QPS cap). *Impact*: users risk losing their account; GenCoder ships no warning. *Evidence*: `ws-server.ts:73-131` (no throttle), no rate-limit code anywhere in `extension/` or `deepseek-bridge/`. (DeepSeek's specific ToS text is `⚠ unverified — based on common knowledge as of 2026-05-11`.)
- ⚠ **Bearer token + cookies sent over plaintext loopback** — fine for `127.0.0.1` but stored in `chrome.storage.local` indefinitely (`background.js:23`) and there's no logout/revocation flow. *Impact*: any local process on the user's machine can hit `http://127.0.0.1:9876/status` and observe connection state; a malicious WebSocket client to `ws://127.0.0.1:9876/ws/deepseek-bridge` is accepted with no auth (`ws-server.ts:280-313`). *Evidence*: `ws-server.ts:264-313` — no Origin check, no token check, only "last connect wins".
- ⚠ **Permissions footprint is broader than strictly needed** — manifest grants `tabs` + `scripting` + host permission to `chat.deepseek.com`. Acceptable, but the popup warning text doesn't explain this to the user. *Evidence*: `manifest.json:6-15`, `popup.html:68-71` (no permissions disclosure).
- ⚠ **`new_chat_clicked` event is dead code** — `content.js:23-26` declares the intent but never fires; the comment says "only fire if this wasn't triggered by our own handler" then falls through without ever calling `chrome.runtime.sendMessage`. *Impact*: the handler's elegant `_onNewChatClicked` reset (`index.ts:91-96`) never runs from user clicks — only from chat-id-change indirection. *Evidence*: `content.js:11-26` vs `index.ts:91-96`.
- ⚠ **Logo / icon missing** — `extension/README.md:25` says "provide your own 128px PNG"; manifest has no `icons` field; popup uses the default extension icon. Polish gap that hurts perceived legitimacy. *Evidence*: `manifest.json:53-56`, no `extension/icon.png` file.
- ⚠ **Inconsistent branding** — `popup.html:5` title still says "Hybrid Synth Bridge" and `README.md:1` says "Hybrid Synth"; manifest has been updated to "GenCoder" but stragglers remain. *Evidence*: `popup.html:5`, `extension/README.md:1-5` reference port 5000 / FastAPI / `hybrid_synth` despite the real server being a TS WebSocket on 9876.
- ⚠ **README is stale** — `extension/README.md:5` documents `ws://127.0.0.1:5000/ws/deepseek-bridge` and "start the backend with uvicorn", which is wrong for the current TS implementation (port 9876, started automatically by VS Code activation). *Impact*: a contributor reading this can't get the extension working. *Evidence*: `extension/README.md:5,14` vs `ws-server.ts:6-7`.

## 5. Competitor Landscape / المقارنة مع المنافسين

| Competitor | Their approach | Better / Worse than GenCoder | Source |
|---|---|---|---|
| **Cline (upstream)** | No browser-extension bridge. Has a `puppeteer-core`-driven `BrowserSession` for "computer use" — opens a controlled Chromium so the agent can debug a web app the user is building. *Not* for proxying a free chat account. | **Worse for free-LLM use case** — Cline assumes BYO API key. **Better for agent-tests-website use case** — that's a different feature entirely. GenCoder lacks Cline's `BrowserSession` AND adds the chat bridge. The two could coexist; today GenCoder only has the bridge. | `src/services/browser/BrowserSession.ts` (Cline upstream) |
| **Cursor** | "Cursor Browser" — embedded Chromium controlled via Chrome DevTools Protocol. Agent can navigate, screenshot, click. Plus a "Visual Editor" for drag-and-drop layout changes. Requires paid plan for agent features. Not a free-LLM proxy. | **Worse for free-LLM use case** (Cursor requires a Pro subscription for unlimited agent calls). **Better for agent-browses-the-web use case** (mature, polished, integrated). GenCoder's bridge is single-purpose by comparison. | [Meet the new Cursor](https://cursor.com/blog/cursor-3), [Cursor Browser visual editor](https://cursor.com/blog/browser-visual-editor) |
| **Windsurf (Codeium / now Cognition)** | "Windsurf Previews" — built-in live previewer; click a UI element and Cascade reshapes it in code. Agent-driven UI work. No free-LLM proxy concept. | **Worse for free-LLM use case**. **Better for live-UI-editing use case** (Previews is tightly integrated with Cascade agent). | [Windsurf Editor](https://windsurf.com/editor), [Windsurf review 2026](https://vibecoding.app/blog/windsurf-review) |
| **Continue.dev** | Open-source. No browser bridge. Free model access depends entirely on user's API keys / local Ollama. | **Worse for zero-cost free-LLM** — user must BYO key or run a local model. **Comparable openness**. | [Continue docs](https://docs.continue.dev/) — `⚠ unverified — based on common knowledge as of 2026-05-11` |
| **Aider** | CLI-only. No browser concept at all. BYO API key, including a `--browser` web-UI flag but no bridge. | N/A — different surface area. | [aider.chat](https://aider.chat) — `⚠ unverified — based on common knowledge as of 2026-05-11` |
| **OSS free-account proxies — server-side** (`xtekky/deepseek4free`, `JuanCMPDev/deep-proxy`, `thinhdanggroup/chat-deepseek-api`, `rabilrbl/deepseek-api`) | Reverse-engineered HTTP clients that replay `chat.deepseek.com`'s `/completion` endpoint from a Python/Node process. Some (deepseek4free) ship a reversed SHA3-256 PoW solver; deep-proxy is explicitly an OpenAI-compatible proxy you point Aider/Continue/OpenAI SDK at. | **Better for deployment** — runs on any server, no Chrome required, can serve many clients. **Worse for resilience** — when DeepSeek tightens PoW difficulty or rotates the API path, the proxy breaks until someone reverses the new shape. GenCoder's bridge runs in a real authenticated Chrome session so PoW + Cloudflare just work for free. **GenCoder's `deepseek-webapi` provider competes directly with these** and uses the same PoW-solver pattern (`@noble/hashes` SHA3-256, see API_PROVIDERS.md §2). The bridge complements it as a fallback when the direct API path is blocked. | [xtekky/deepseek4free](https://github.com/xtekky/deepseek4free), [JuanCMPDev/deep-proxy](https://github.com/JuanCMPDev/deep-proxy), [thinhdanggroup/chat-deepseek-api](https://github.com/thinhdanggroup/chat-deepseek-api), [rabilrbl/deepseek-api](https://github.com/rabilrbl/deepseek-api) |
| **DeepSeekAI (`DeepLifeStudio/DeepSeekAI`)** | Browser extension that summons a DeepSeek popup anywhere on the web. **Not** a bridge — user supplies their own API key; the extension is a UI affordance, not a free-tier hack. | **Different goal**. GenCoder's bridge is reversed in direction: page → IDE; theirs is page → DeepSeek-API-with-user's-key. | [DeepLifeStudio/DeepSeekAI](https://github.com/DeepLifeStudio/DeepSeekAI) |

**Strategic positioning takeaway**: the bridge architecture is GenCoder's defensive moat against server-side proxies. Server-side proxies have a deployment advantage (no Chrome, run on any VPS, serve many users) but a fragility disadvantage (every DeepSeek anti-abuse change breaks them). GenCoder leans into the resilience trade-off but pays for it with manual-install friction. The recommended P0/P1 work below is mostly about closing that friction gap.

## 6. Recommended Additions / مميزات مقترحة للإضافة

### P0 — Must-have (blocks parity / de-risks production)

1. **Auto port-discovery + multi-window coexistence** — Replace the hard-coded `PORT = 9876` with a probe sequence (9876, 9877, 9878, …, first 10 free), write the chosen port to `chrome.storage.local` via a `chrome.runtime.connectNative` companion or via a fixed `127.0.0.1:9876/__discover__` endpoint that 302s to the active port.
   - *Why*: closes the "two VS Code windows silently fight" gap from §4.
   - *Where it goes*: `src/core/api/providers/deepseek-bridge/ws-server.ts:6,315-329` (port loop + EADDRINUSE recovery); `extension/background.js:6` (discovery client); add `__discover__` GET handler to existing http server.
   - *Effort*: M. *Risk*: low.

2. **Bidirectional heartbeat with liveness budget** — Server tracks `lastPongAt` and marks the bridge unhealthy after `3 × HEARTBEAT_MS` (60 s) of silence; surfaces via `getBridgeStatus()` so the agent loop can fail fast instead of waiting 120 s.
   - *Why*: closes the "OPEN socket but dead service worker" gap; fail-fast is the single biggest UX win.
   - *Where it goes*: `ws-server.ts:65-71, 192-200, 210` (add `lastPongAt`); `background.js:70-80` (already sends ping — wire server-side liveness check).
   - *Effort*: S. *Risk*: low.

3. **Versioned, self-healing DOM selectors with telemetry** — Tag each selector group with a `__schemaVersion: "2026-05"`. On any "button not found" failure, log to `chrome.storage.local.failedSelectors` and emit `{type:"selector_drift", selector, schemaVersion}` over WebSocket so the VS Code side can surface a UI banner: "DeepSeek UI changed — bridge may be degraded, update GenCoder."
   - *Why*: brittle selectors are the #1 systemic risk; today users see no signal until the agent silently mis-clicks.
   - *Where it goes*: `extension/injected.js:9-63` (selector tables + version tag); `extension/injected.js:482, 495` (already has `console.warn` — replace with telemetry post); `ws-server.ts` (new `selector_drift` event); webview ChatRow banner.
   - *Effort*: M. *Risk*: low.

4. **Local-loopback auth on the WebSocket** — Generate a per-install token at first launch (`StateManager` global state `bridgeAuthToken`), write it to `chrome.storage.local` via the popup ("Connect" button that fetches `/handshake?token=…`), require it in the `hello` message. Reject unauthenticated connections.
   - *Why*: closes the "any local process can hijack 127.0.0.1:9876" gap; minimal friction since the token autoflows.
   - *Where it goes*: `ws-server.ts:280-313` (auth on connection); `background.js:107-118` (include token in hello); `popup.js` (one-time handshake button); add `bridgeAuthToken` to `src/shared/storage/state-keys.ts` per CLAUDE.md instructions.
   - *Effort*: M. *Risk*: medium (state-key plumbing has many touch points per CLAUDE.md §"Adding New Global State Keys").

5. **README + branding cleanup; ship a 128px icon** — Rewrite `extension/README.md` to reflect the real protocol (port 9876, started by VS Code activation, not uvicorn). Fix `popup.html:5` title. Add `extension/icon.png` + `icons` block in manifest. This is a 30-minute polish that reads as "amateur project" today.
   - *Why*: trust & install conversion. Anyone reading the current README cannot install successfully.
   - *Where*: `extension/README.md`, `extension/popup.html:5`, `extension/manifest.json` (add `icons`), `extension/icon.png` (new asset).
   - *Effort*: S. *Risk*: low.

### P1 — Should-have (gets us ahead)

1. **Snapshot tests for the SSE parser** — Capture real DeepSeek SSE traces (response, reasoning, with-search, with-deepthink, error, [DONE]) as fixture files under `extension/__tests__/fixtures/`, write a vitest harness that imports `createSSEParser` (need to export it) and asserts deterministic chunk ordering. Run in CI on every PR.
   - *Why*: the parser is the load-bearing piece; today it has zero automated coverage.
   - *Where*: new `extension/__tests__/parser.test.ts`; `injected.js:231` exported; `package.json` test script.
   - *Effort*: M. *Risk*: low.

2. **Firefox MV3 port** — Add `extension/manifest.firefox.json` with `background.scripts` (page) instead of `service_worker`; polyfill `world:"MAIN"` via a `<script>` tag injection from content.js. Ship as a separate XPI.
   - *Why*: opens the entire Firefox user base; Firefox-first developer demographic skews toward open-source tools — natural audience.
   - *Where*: new `extension/manifest.firefox.json`; small shim in `content.js:1-10` to detect Firefox and inject a `<script src="injected.js">` tag.
   - *Effort*: M. *Risk*: medium (Firefox MV3 quirks).

3. **Headless / Playwright bridge mode** — Optional VS Code setting `deepSeekBridge.headless: true` boots an internal Playwright Chromium with the extension preloaded, signs the user in once (cookies persisted to `~/.gencoder/bridge-profile/`), and runs the full bridge without the user needing to install anything.
   - *Why*: collapses the "manual install" friction from §4 to zero; transforms the bridge from "power user trick" to "default free-tier provider."
   - *Where*: new `src/core/api/providers/deepseek-bridge/headless-runner.ts` using `playwright` (already in devDeps per `package.json` references); add setting + UI toggle in `DeepSeekBridgeProvider.tsx`; reuse the existing `ws-server.ts` without changes.
   - *Effort*: L. *Risk*: medium (Playwright bundling size; cookie persistence security).

4. **Wire up `new_chat_clicked` properly** — Detect the actual user click on DeepSeek's "New Chat" button in `injected.js` (event listener on the resolved button, dedup against our own programmatic clicks), post `hs_new_chat_clicked` → forward through content/background/WS → emit on `bridgeBus`.
   - *Why*: handler already has `_onNewChatClicked` listener (`index.ts:91-96`); just no producer.
   - *Where*: `extension/injected.js` (new listener); `extension/content.js:23-26` (replace dead code with actual `chrome.runtime.sendMessage`); `ws-server.ts:225-229` (already has emit).
   - *Effort*: S. *Risk*: low.

5. **Opt-in telemetry: selector hit-rate + parser format-mix** — Once selector_drift events exist (P0 #3), aggregate anonymized to `bridge-health.json` in `~/.gencoder/data/` (no network). Surface a "Bridge Health" panel in settings showing "DeepThink: 100%, Search: 100%, SSE Format C: 97%". Helps maintainers (and the user) understand drift trends.
   - *Why*: data-driven maintenance. We currently fly blind.
   - *Where*: new file `src/core/api/providers/deepseek-bridge/health.ts`; settings panel addition.
   - *Effort*: M. *Risk*: low (local-only telemetry stays compliant).

### P2 — Nice-to-have (differentiators)

1. **Multi-account pooling** — Allow connecting multiple Chrome profiles (or multiple browsers); the bridge round-robins prompts across them, tolerating per-account DeepSeek rate limits and giving the user more sustainable free-tier throughput.
   - *Why*: a multi-account user can effectively bypass per-account QPS; mirrors how `gpt4free`-class projects already pool. *Caveat*: closer to ToS violation — surface a clear warning.
   - *Where*: `ws-server.ts` (accept multiple `extensionWs` clients, drop singleton invariant, add round-robin); handler gets a `bridgeClientId` per request.
   - *Effort*: L. *Risk*: medium (ToS perception).

2. **Generalize to "any web AI service" bridge framework** — Refactor `injected.js` into a service-adapter pattern: `adapters/deepseek.js`, `adapters/claude-ai.js`, `adapters/chatgpt.js`, `adapters/gemini.js`. Each adapter exports `{textareaSelector, sendSelector, sseParser, modes}`. The bridge core becomes service-agnostic; ship adapters as they pass tests.
   - *Why*: turns a single-vendor hack into a generic "free agent loop over any chat UI" framework — a real moat. Users with Claude.ai Pro or ChatGPT Plus subscriptions get agent access without paying for API on top.
   - *Where*: refactor `extension/injected.js` into `extension/core/` + `extension/adapters/{deepseek,chatgpt,claude,gemini}.js`; manifest content_scripts gain `*.openai.com`, `*.claude.ai`, `*.google.com/gemini`.
   - *Effort*: XL. *Risk*: high (ToS pressure escalates; vendor cat-and-mouse).

3. **Bridge-side prompt-cache emulation** — DeepSeek doesn't expose prompt caching to free-tier; emulate it by detecting unchanged prefixes in `formatMessages()` and persisting the cached tail in `~/.gencoder/cache/deepseek-prefix-{hash}.json`. On a hit, send only the diff via the existing `delta: true` path. (Today `delta` is true on every non-first call; a content-hash cache would skip even the no-op turns.)
   - *Why*: lower latency, fewer tokens, smaller cost when GenCoder eventually adds paid DeepSeek key support.
   - *Where*: `src/core/api/providers/deepseek-bridge/index.ts:104-140` (prefix-hash + cache lookup).
   - *Effort*: M. *Risk*: low.

4. **Chrome Web Store + Edge Add-ons publication** — Package as `.crx`, sign with a long-lived key, submit for review. Adds auto-update + trust signal. Coordinate with branding rename so the store listing says "GenCoder" not "Hybrid Synth."
   - *Why*: install conversion + auto-update. Today's manual Load Unpacked loses ~80% of would-be users.
   - *Where*: `scripts/package-extension.mjs` (new); CI release pipeline.
   - *Effort*: M (mostly review-cycle calendar time). *Risk*: low — except Chrome may reject "automates third-party site" extensions under their MV3 anti-automation policy. **⚠ unverified — needs a TOS read before investing**.

## 7. Open Questions / أسئلة مفتوحة

- Does the Chrome Web Store review process actually allow an extension whose explicit purpose is to automate `chat.deepseek.com`? (Several similar "ChatGPT-to-API" extensions have been pulled in past years.) — needs research before P2 #4.
- What is DeepSeek's actual ToS position on browser automation? Is the bridge legally distinct from the server-side proxies that have received C&Ds?
- Does Edge actually work with the current manifest, or do we need a `manifest.edge.json` variant? (README claims yes but no CI verification.)
- Should the bridge support DeepSeek's image-input mode (`extension/injected.js:516-577` ships the attach path, but is it being exercised end-to-end? The `deepSeekBridgeModel.supportsImages: true` claim in `src/shared/api.ts` per prior API_PROVIDERS.md §2 implies yes — needs verification.)
- Is there a Cline upstream `BrowserSession` (puppeteer-core "computer use") feature we should preserve / expose alongside the bridge? Today the bridge is the only browser-touching feature; if the fork drops or doesn't surface Cline's puppeteer feature, that's a regression worth documenting in a future ARCHITECTURE.md refresh.

## 8. Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-11 | research-feature-analyst | Created — initial analysis of `extension/` Chrome bridge (manifest + background + content + injected + popup) and the `src/core/api/providers/deepseek-bridge/ws-server.ts` server side. Five gaps elevated to P0 (port discovery, heartbeat liveness, selector drift telemetry, loopback auth, README/branding). |
