# DeepSeek Integration — Competitive Analysis
> Maintained by `research-feature-analyst`. Last updated: 2026-05-11.
> Sources verified this revision: `src/core/api/providers/deepseek-webapi/handler.ts` (full read, 1-335), `src/core/api/providers/deepseek-webapi/pow-solver.ts` (full read, 1-94), `src/core/api/providers/deepseek-bridge/index.ts` (full read, 1-219), `src/core/api/providers/deepseek-bridge/ws-server.ts` (full read, 1-357), `src/core/api/providers/deepseek.ts` (full read, 1-142), `src/shared/api.ts:2193-2218,5066-5097`, `src/core/api/index.ts:14-16,464-471`, `proto/cline/models.proto:433,464-465`, `src/shared/proto-conversions/models/api-configuration-conversion.ts:293-296,389-392`, `src/core/controller/state/updateSettings.ts:355-388`, `src/extension.ts:83-84,697-698`, `webview-ui/src/components/chat/BridgeModeToolbar.tsx` (full read, 1-107), `webview-ui/src/components/settings/providers/DeepSeekWebApiProvider.tsx` (full read), `package.json:456` (`@noble/hashes ^2.2.0`), `extension/injected.js:23-502` (selector + mode toggle excerpts), `plans/deepseek-rest-api-integration.md` (full read, 1-552).

## 1. Overview / نظرة عامة

GenCoder ships **three** DeepSeek code paths that share zero protocol code: (1) `deepseek` — the upstream-Cline OpenAI-compatible REST handler against `api.deepseek.com/v1` requiring a paid key; (2) `deepseek-bridge` — the DOM-scraping path that drives `chat.deepseek.com` through a Chrome extension over a local WebSocket; (3) `deepseek-webapi` — a Node-side direct caller of DeepSeek's internal `/api/v0/chat/completion` endpoint authenticated by a bearer token harvested from the same Chrome extension and gated by an in-process SHA3-256 proof-of-work. Paths (2) and (3) are fork-original and have no analog in any major IDE-AI agent we surveyed. This document is the protocol-layer companion to `API_PROVIDERS.md` (handler/factory layer) and `BROWSER_BRIDGE.md` (transport/Chrome-extension layer).

## 2. Current State in GenCoder / الوضع الحالي

- **Entry points (handler factory)**: `src/core/api/index.ts:14-16` (imports) and `:464-471` (switch cases for `"deepseek"`, `"deepseek-bridge"`, `"deepseek-webapi"`).
- **Bootstrap**: `src/extension.ts:83-84` calls `startBridgeServer()` on activation; `:697-698` calls `stopBridgeServer()` on deactivation. The WebSocket server binds `127.0.0.1:9876` on path `/ws/deepseek-bridge` (`ws-server.ts:6-7`).

### 2.a Path A — Direct Web API (`deepseek-webapi`)

- **Endpoints used** (`deepseek-webapi/handler.ts:22-23`):
  - `POST https://chat.deepseek.com/api/v0/chat/create_chat_session` — establishes a `chat_session_id`.
  - `POST https://chat.deepseek.com/api/v0/chat/completion` — sends a prompt, returns SSE.
  - `POST https://chat.deepseek.com/api/v0/chat/create_pow_challenge` — PoW challenge for either of the above (`pow-solver.ts:50`).
- **Required headers** (`pow-solver.ts:24-43`): `x-app-version: 2.0.0`, `x-client-platform: web`, `x-client-locale: en_US`, `x-client-version: 2.0.0`, `x-client-timezone-offset: 10800`, fixed Windows Chrome 147 UA, `Origin: https://chat.deepseek.com`, `Referer: https://chat.deepseek.com/`, `Authorization: Bearer <token>`, and optional `Cookie`. Every request to a privileged endpoint also carries `x-ds-pow-response: <base64-encoded answer>` (`handler.ts:198,256`).
- **Proof-of-Work algorithm** (`pow-solver.ts:71-83`): server returns `{algorithm, challenge, salt, signature, difficulty, expire_at, expire_after, target_path}`. Solver computes `SHA3-256(challenge + salt + nonce.toString())` for `nonce = 0,1,2,...` until the **first 4 bytes interpreted as big-endian uint32** are less than `floor(0x100000000 / difficulty)`. The answer payload `{algorithm, challenge, salt, answer, signature, target_path}` is JSON-stringified, base64-encoded, and sent in `x-ds-pow-response`. Logged difficulty observed at runtime: `144000` → ~0.3s average solve (`handler.ts:225`).
- **Crypto library**: `@noble/hashes/sha3.js` (`pow-solver.ts:1`), pinned at `^2.2.0` in `package.json:456`. Chosen explicitly because Electron's bundled OpenSSL on some platforms lacks SHA3 (comment, `pow-solver.ts:68-69`).
- **Session lifecycle** (`handler.ts:25-28,191-219,316-318`):
  1. First `createMessage` call: solve PoW → `POST create_chat_session` with body `{character_id: null}` → extract `id` from a four-key fallback ladder `json.data.biz_data.id || json.data.biz_data.chat_session_id || json.data.id || json.data.chat_session_id`.
  2. Store `session = {id, lastMessageId: 0}` for the handler's lifetime.
  3. Completion request body: `{chat_session_id, model_type: null, parent_message_id, preempt: false, prompt, ref_file_ids: [], search_enabled: false, thinking_enabled: false}`.
  4. After each turn: `lastMessageId += 2` (user + assistant); `sentMessageCount = messages.length`.
- **Prompt format** (`handler.ts:171-189`): pseudo-XML — `<system>...</system>\n\n<human>...</human>\n\n<assistant>...</assistant>` joined by double newlines. System prompt is **only included on the first call**; subsequent turns send a delta from index `sentMessageCount` onward without the system block. This is documented at line 234: *"DeepSeek stores the conversation server-side"*.
- **SSE parser — five formats** (`handler.ts:32-153`). Buffer is split on `\n`, lines starting `data:` are JSON-parsed (skipping `[DONE]`):
  - **Format A — Full snapshot**: `{v: {response: {fragments: [{type, content}]}}}` where `type ∈ {RESPONSE, REASONING}`.
  - **Format B — OpenAI-style delta**: `{choices: [{delta: {content | text | reasoning_content | thinking_content}}]}`.
  - **Format C — Fragment append**: `{p: "response/fragments" | "v/response/fragments", o: "APPEND", v: [{type, content}]}` — flips `inResponseFrag`/`inReasoningFrag` state so subsequent Format-D chunks land in the right channel.
  - **Format D — Content delta**: `{p: "response/fragments/-1/content" | "v/response/fragments/-1/content", o: "APPEND"|"SET", v: "<chunk>"}` — honors `SET` to replace and `APPEND` to concatenate.
  - **Format E — Choices-path delta**: `{p: "choices/N/delta/text" | "choices/N/delta/content" | "message/content", v: "<chunk>"}` and the reasoning variant on `delta/thinking_content` or `delta/reasoning_content`.
  - State machine carries `curPath`, `curOp`, `inResponseFrag`, `inReasoningFrag`, `prevRespLen`, `prevReasLen` so deltas are computed locally and surfaced as monotone `onChunk`/`onReasoning` callbacks.
- **Streaming-to-async-iterator bridge** (`handler.ts:267-311`): a queue + manual `wakeUp` resolver pump SSE chunks from a background reader into the `ApiStream` generator. SSE reader exits when `this.aborted` flips.
- **Abort handling** (`handler.ts:329-333`): `abort()` flips `aborted`, **nulls the session** and resets `sentMessageCount = 0` — i.e. the next `createMessage` starts a new server-side conversation. The SSE-reader loop checks `this.aborted` only between `reader.read()` returns; an in-flight read is not actively cancelled (no `AbortSignal` is passed to `fetch` — confirmed by reading `handler.ts:252-260`).

### 2.b Path B — DOM Bridge (`deepseek-bridge`)

- **Transport**: local WebSocket on `ws://127.0.0.1:9876/ws/deepseek-bridge` (`ws-server.ts:6-7`); only one extension client is allowed at a time — a new connection replaces the previous (`ws-server.ts:283-286`).
- **Wire format** — JSON messages, both directions, no protobuf:
  - **Outbound (Node → ext)**: `{type: "prompt", id, text, mode: "auto"|"visible", delta, sessionId, options: {deepThink, search, responseMode}}` (`ws-server.ts:109-121`); also `{type: "attach_image", id, data, mimeType}`, `{type: "new_chat"}`, `{type: "request_token"}`, `{type: "ack", status: "connected"}`.
  - **Inbound (ext → Node)**: `{type: "hello"}`, `{type: "token", bearerToken, cookies}`, `{type: "chunk"|"reasoning"|"done"|"error", id, text|code|detail}`, plus out-of-band events `{type: "chat_id_changed", chatId}`, `{type: "context_lost", reason}`, `{type: "new_chat_clicked"}`, `{type: "attach_progress", id}`, `{type: "pong"}` (`ws-server.ts:182-255`).
- **Credentials path**: on `hello` the server immediately asks the extension for `request_token`; the extension responds with `{type: "token", bearerToken, cookies}` and these are cached in module-level `_bearerToken` / `_cookies` (`ws-server.ts:51-63, 193-208`). **Path A re-uses these via `getBridgeCredentials()`** (`handler.ts:7,163-169`) — i.e. the WebSocket bridge is also the bearer-token harvester for the direct-API path.
- **Session machine** (`deepseek-bridge/index.ts:71-102`): handler keeps `sessionId` (a Node-generated UUID, not DeepSeek's), `sentMessageCount`, `lastChatId`, `contextLost`. The `bridgeBus` `EventEmitter` listens for:
  - `chat_id_changed`: if `lastChatId !== null && new !== lastChatId`, set `contextLost = true` so the next turn restarts as `isFirstCall`.
  - `context_lost`: same effect.
  - `new_chat_clicked`: full reset (sessionId/sentMessageCount/contextLost/lastChatId → null/0/false/null).
- **Prompt format**: identical pseudo-XML scheme to Path A (`deepseek-bridge/index.ts:21-46`). Delta sending governed by `isFirstCall` (`:108-116`).
- **Image attachments**: extracted from messages of `block.type === "image"` with base64 source (`:53-68`); shipped one-by-one over `sendAttachImage` before the prompt, with an 8s per-attach timeout and an `attach_progress` ack handshake (`ws-server.ts:133-162`).
- **Request timeout**: 120s fixed (`ws-server.ts:8, 87-92`).
- **Abort handling** (`deepseek-bridge/index.ts:104-217`): uses `AbortController`; on abort signal fires, pushes `null` to the queue to unblock the iterator; **removes all three `bridgeBus` listeners**. The in-flight `sendPrompt` promise is awaited with `.catch(() => {})` to avoid unhandled rejections.

### 2.c Modes — DeepThink / Search / Expert

- **Wire surface** (Path B only — Path A hard-codes both to `false`):
  - Bridge payload: `options: {deepThink: boolean, search: boolean, responseMode: "instant" | "expert"}` (`ws-server.ts:116-120`).
  - Direct webapi payload: `thinking_enabled: false, search_enabled: false` hard-coded (`handler.ts:248-249`).
- **Settings plumbing** (`src/core/controller/state/updateSettings.ts:356-388`): three global-state keys `deepSeekBridgeDeepThink`, `deepSeekBridgeSearch`, `deepSeekBridgeResponseMode`. After a change, the controller calls `setBridgeOptions(...)` so the module-level singleton in `ws-server.ts:31-43` mirrors state without forcing the handler to read StateManager directly.
- **UI surface** (`webview-ui/src/components/chat/BridgeModeToolbar.tsx:6-107`): three pill controls (🧠 DeepThink, 🌐 Search, Instant/Expert segmented). Toolbar self-hides when `apiProvider !== "deepseek-bridge"`, so the modes are explicitly **bridge-only** in the UI.
- **Extension-side actuation** (`extension/injected.js:23-502`): `injected.js` clicks DOM buttons by selector + text match — DeepThink button is matched by `'button[class*="deepthink" i]'` / `'button[aria-label*="DeepThink" i]'` / `'button[title*="DeepThink" i]'` (`:23-30`) and text content `["DeepThink", "深度思考", "deep think"]` (`:475`). Expert is matched on selector `'button[class*="expert" i]'` / `'button[aria-label*="Expert" i]'` (`:39-42`) and text `["Expert", "专家版"]` (`:500`). i.e. — **the modes are not part of the bridge wire protocol; they are DOM-button presses driven by the extension before the prompt is submitted**.

### 2.d Path C — Paid Direct REST API (`deepseek`)

- **Endpoint**: `https://api.deepseek.com/v1` via the `openai` SDK with `fetch` swapped in (`deepseek.ts:35-39`).
- **Tool calling**: full OpenAI-style tool-call streaming, with `ToolCallProcessor` plumbing for incremental tool-arg deltas (`deepseek.ts:99-128`).
- **Reasoning**: handles `delta.reasoning_content` (`deepseek.ts:117-122`) and prepends a reasoning-content marker for `deepseek-reasoner` via `addReasoningContent()` (`deepseek.ts:87-88`).
- **Usage / cost** (`deepseek.ts:47-77`): reads DeepSeek-specific `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` and calls `calculateApiCostOpenAI()`. **This is the only path of the three that produces real token + cost numbers.**
- **Retry**: `@withRetry()` decorator (`deepseek.ts:79`); the bridge and webapi handlers lack this.

### 2.e Model declarations & proto wiring

- `src/shared/api.ts:2195-2218` — `deepSeekModels`: `deepseek-chat` and `deepseek-reasoner`, both 128k context, `supportsPromptCache: true`, prices populated.
- `src/shared/api.ts:5067-5077` — `deepSeekBridgeModels.deepseek-bridge`: 8192 maxTokens / 131072 context / **`supportsImages: true`** / `supportsPromptCache: false` / all prices zero.
- `src/shared/api.ts:5083-5094` — `deepSeekWebApiModels.deepseek-webapi`: same except **`supportsImages: false`**.
- Proto enum (`proto/cline/models.proto:433,464-465`): `DEEPSEEK = 11`, `DEEPSEEK_BRIDGE = 42`, `DEEPSEEK_WEBAPI = 43`. Round-trip maps both directions (`api-configuration-conversion.ts:293-296, 389-392`).

### 2.f Tests

- ❌ No coverage found. No `__tests__` subfolder under either custom-provider directory. Root-level `test-bridge-ws.mjs` (212 LOC) and `test_bridge.py` (71 LOC) are manual smoke scripts. The PoW solver — the most algorithmically interesting piece of new code — is untested.

### 2.g The Arabic plan (`plans/deepseek-rest-api-integration.md`, 552 LOC)

User-authored roadmap dated 2026-05-09. Goal: replace `deepseek-bridge` with the official OpenAI-compatible `api.deepseek.com/v1` REST API as "v2.0". **Status check vs current code**:
- Phase 2 (DeepSeek REST handler): ✅ already exists as `deepseek.ts` (predates the plan).
- Phase 3 (proto + types): ✅ `DEEPSEEK = 11` is the upstream Cline enum value; types in `api.ts:2195-2218`.
- Phase 4 (webview ApiOptions): ✅ standard provider component exists.
- Phase 5 (CLI ModelPicker): ⚠ unverified — see `API_PROVIDERS.md §4` which flags CLI gap for the two custom providers, not the standard one.
- Phase 6 (`useDeepSeekWebSocket` feature flag): ❌ not implemented — bridge still always starts on activation (`extension.ts:83-84` is unconditional).
- Phase 7-8 (tests, docs, PR): ❌ no tests, no `docs/provider-config/deepseek.md` found.
- **Plan-vs-reality drift**: the plan presumed users would migrate off the bridge to the paid REST API; the actual product positioning kept the bridge as the headline "Free" option and added a second free path (`deepseek-webapi`) — i.e. the user reversed direction without updating the document.

## 3. Advantages / المميزات الحالية

- ✅ **Real PoW solver, not a static workaround** — `solvePoW()` (`pow-solver.ts:71-83`) handles arbitrary `difficulty` and `algorithm` strings from the server, so DeepSeek raising difficulty doesn't break it (only slows it). *Evidence*: the algorithm string is read from the challenge (`pow-solver.ts:72`) rather than hard-coded.
- ✅ **Five SSE format variants parsed by one state machine** (`handler.ts:32-153`) — DeepSeek's protocol returns wildly different shapes depending on the model and feature flags, and this parser accepts all observed forms in a single dispatch table without re-buffering. *Evidence*: explicit comments labelling Format A/B/C/D/E.
- ✅ **Bearer-token harvesting and session creation are decoupled** — the WebSocket bridge is the sole credential source (`ws-server.ts:51-63`) and both Path A (direct) and Path B (DOM) consume it via `getBridgeCredentials()`. *Evidence*: `handler.ts:7,163-169`.
- ✅ **Server-side history reuse** — pseudo-XML prompt is shipped delta-only after the first turn, and DeepSeek's `chat_session_id` / `parent_message_id` chaining preserves context server-side. This cuts uplink bytes on long agent loops by an order of magnitude. *Evidence*: `handler.ts:230-239,316`, `deepseek-bridge/index.ts:107-116,139`.
- ✅ **Out-of-band context-loss recovery** — the bridge listens for the user clicking "New Chat" in the browser tab and resets its own session counters (`deepseek-bridge/index.ts:80-102`), avoiding the silent-wrong-context failure mode that plagues most browser-automation agents.
- ✅ **Reasoning stream is first-class** — both paths surface `reasoning_content` / `thinking_content` deltas as `ApiStream` items of type `"reasoning"` (`handler.ts:120-122,309-310`, `deepseek-bridge/index.ts:153-156,183-185`), so DeepThink chain-of-thought renders in the UI like Claude/o1 thinking blocks.
- ✅ **Mode controls are user-driven, not hard-coded** — DeepThink/Search/Expert toggles are persisted, broadcast over `setBridgeOptions`, and driven into DOM clicks at the right moment (`extension/injected.js:463-502`). *Evidence*: `BridgeModeToolbar.tsx` + `updateSettings.ts:355-388`.
- ✅ **Crypto-resilient PoW** — `@noble/hashes` is a pure-JS implementation, immune to Electron-bundled-OpenSSL gaps on certain platforms. *Evidence*: explicit comment `pow-solver.ts:68-69`.

## 4. Disadvantages & Gaps / العيوب والثغرات

- ⚠ **`createMessage` `fetch()` calls do not pass an `AbortSignal`** (`handler.ts:194-201,252-260`). `abort()` flips a boolean (`:329-333`) but an in-flight HTTPS request continues until the body is fully read; the abort check is only between SSE reads. *Impact*: a cancelled task in a slow-network scenario still consumes DeepSeek server resources and the agent UI stalls for seconds. *Evidence*: no `signal:` field on the `fetch` options objects.
- ⚠ **PoW solver runs on the main thread** (`pow-solver.ts:76-82`) — a tight CPU loop with no async yield. At difficulty 144000 it averages 0.3s (per handler log line), but a 10× difficulty bump = 3s of frozen extension host **per request**. No Worker, no `setImmediate`, no progress reporting. *Impact*: agent loops with many small turns would feel like hangs.
- ⚠ **Path A hard-codes `thinking_enabled: false, search_enabled: false`** (`handler.ts:248-249`). The mode-toolbar UI suggests these are user-controllable, but they only flow through Path B's DOM-click route. *Impact*: a user on `deepseek-webapi` who toggles DeepThink expects reasoning — and gets nothing, silently. *Evidence*: handler.ts hard-codes both fields; only `deepseek-bridge` reads `getBridgeOptions()` (`deepseek-bridge/index.ts:117-124`).
- ⚠ **Stateful session is in-memory only** — `private session: ChatSession | null` (`handler.ts:158`) and `private sessionId: string | null` (`deepseek-bridge/index.ts:74`) live on the handler instance. *Impact*: a VS Code window reload mid-task discards `chat_session_id` and `parent_message_id`, breaking the server-side history chain. Next turn after reload either re-creates the session (losing context) or — worse on Path A — `parent_message_id: 0` against a session that already advanced server-side, with undefined behavior.
- ⚠ **No usage / token reporting** — both handlers yield `{ inputTokens: 0, outputTokens: 0, totalCost: 0 }` (`handler.ts:322`, `deepseek-bridge/index.ts:194-201`). Context-window depletion warnings, telemetry, and cost displays are all inert. Users on long agent runs have no signal that the context budget is exhausting.
- ⚠ **No retry / back-off in either custom handler** — single `fetch` failure or 4xx surfaces as a thrown error (`handler.ts:262-265`, `ws-server.ts:90-92`). Compare `deepseek.ts:79` which has `@withRetry()`. *Impact*: agent loops abort on transient network blips.
- ⚠ **PoW header is solved per-request** (`handler.ts:226-231,253`) — `getPoWHeader()` is called for `create_chat_session` and then **again** for the completion call. Two PoW solves per turn = ~0.6s of fixed overhead before any LLM work. No caching of PoW headers within their `expire_at` window (the challenge struct has `expire_at` / `expire_after` — `pow-solver.ts:11-12` — but the solver doesn't honor them).
- ⚠ **Single global `_bearerToken` / `_cookies`** (`ws-server.ts:52-63`) — multi-account use is impossible; the last-connected extension wins. No per-handler credential scoping.
- ⚠ **Schema fragility**: response-parsing in `ensureSession()` (`handler.ts:208-214`) tries four key paths (`json.data.biz_data.id` → `.biz_data.chat_session_id` → `.data.id` → `.data.chat_session_id`) — evidence that DeepSeek already changed this schema at least once. There is no version detection or telemetry to alert when schema drift breaks the fork.
- ⚠ **`x-app-version: 2.0.0` and Chrome 147 UA hard-coded** (`pow-solver.ts:25,32-33`) — DeepSeek may bump the minimum client version at any time and silently 4xx older calls. No update path.
- ⚠ **Plan-vs-reality drift unresolved** — `plans/deepseek-rest-api-integration.md` advocates phasing out the bridge in favor of the official REST API; the actual product doubled down on free-account paths. The plan should be either updated or archived. *Evidence*: bridge still default in `providers.json` (verified in `API_PROVIDERS.md §2`), still auto-started in `extension.ts:83-84`, no `useDeepSeekWebSocket` flag exists.
- ⚠ **`thinking_enabled` semantics undefined for `deepseek-webapi` model**: the model object (`api.ts:5083-5094`) doesn't declare anything about reasoning support, yet the SSE parser handles `reasoning_content` / `thinking_content` deltas. Either the parser is dead code on this path or the handler should be sending `thinking_enabled: true` when DeepThink is on.
- ⚠ **No automated tests** for the PoW math, SSE parser, or session machine. The SSE parser has at least 5 format branches and ~120 lines of stateful path-matching — exactly the kind of code that decays silently on protocol changes. *Evidence*: no `*deepseek*test*` files found anywhere.
- ⚠ **Tool calling absent on the free paths** — both custom handlers ignore the `tools?` param entirely (`handler.ts:221`, `deepseek-bridge/index.ts:104`). All tool use therefore routes through XML-tool variants. (Same gap noted in `API_PROVIDERS.md §4` and `BROWSER_BRIDGE.md` — verified consistent across the three docs.)

## 5. Competitor Landscape / المقارنة مع المنافسين

| Competitor | Their approach | Better / Worse than GenCoder | Source |
|---|---|---|---|
| Cline (upstream) | `deepseek.ts` only — OpenAI-compatible REST against `api.deepseek.com/v1` with paid key. No web/bridge/PoW. | **Worse for free-tier users** (no path) / *better* for stability (no DOM/PoW dependency, real token accounting, retry decorator). | upstream `src/core/api/providers/deepseek.ts` (mirrored in our fork at `src/core/api/providers/deepseek.ts:1-142`). |
| Cursor | Proprietary model router; does not expose user-controllable DeepSeek selection on the free tier (all routed through Cursor's own backend). PoW / chat.deepseek.com integration: none. | **Worse for transparency** — user can't drive the open DeepSeek backend directly; *better* for reliability — Cursor's backend takes the abuse risk. | `cursor.com` docs `⚠ unverified — based on common knowledge as of 2026-05-11`. |
| Windsurf (Codeium) | Same pattern as Cursor — vendor-mediated model access; no direct DeepSeek protocol exposed. | Same trade-off as Cursor. | `⚠ unverified — based on common knowledge as of 2026-05-11`. |
| Continue.dev | Provider config schema supports `provider: "deepseek"` with an API key against `api.deepseek.com/v1` (OpenAI-compatible). No free/PoW/web path. | **Worse for free-tier**, *better* — open-source baseline with first-class tool calls. | `continue.dev` docs `⚠ unverified — based on common knowledge as of 2026-05-11`. |
| Aider | Routes DeepSeek via LiteLLM → `api.deepseek.com`. CLI-only; no free-account path; no PoW. | Same baseline as Continue. | `aider.chat` docs `⚠ unverified — based on common knowledge as of 2026-05-11`. |
| `deepseek4free` / `deep-proxy` / `DeepLifeStudio/DeepSeekAI` | Static Python/Node proxies that translate `api.deepseek.com/v1`-shaped requests to `chat.deepseek.com` calls. **Most do implement a PoW solver** (SHA3-256, identical math). They use cookies/headers from a browser session pasted by the user; some have token-refresh loops. | **GenCoder is better** on UX (bearer token auto-harvested by a Chrome extension instead of manual cookie paste) and on resilience (multi-format SSE parser, event-bus context-recovery). **GenCoder is worse** on portability — these proxies run headlessly as services, no IDE coupling, no port-9876 single-tenancy. | GitHub repos for the OSS proxies `⚠ unverified — based on common knowledge as of 2026-05-11`; same source set as `BROWSER_BRIDGE.md §5`. |
| Roo Code / Kilo Code | Cline forks; ship the upstream `deepseek.ts` REST handler. Neither has shipped a free-account or PoW path as of this writing. | GenCoder uniquely owns the free-DeepSeek-in-an-agent niche among Cline forks. | upstream Cline repo `⚠ unverified — based on common knowledge as of 2026-05-11`. |

**Net positioning**: GenCoder's three-path DeepSeek integration is uncontested in the IDE-agent space. The closest comparable work lives in standalone OSS proxy projects which solve roughly the same protocol problem but lack the IDE / agent loop / event-bus context-recovery story.

## 6. Recommended Additions / مميزات مقترحة للإضافة

### P0 — Must-have (blocks parity / blocks reliability)

1. **Pass `AbortSignal` through `fetch` calls** in `deepseek-webapi/handler.ts` (`:194,252`) so `abort()` cleanly cancels in-flight HTTPS, not just the SSE-read loop.
   - *Why*: §4 first gap — currently a cancelled task can hang for seconds on slow networks.
   - *Where it goes*: store `this.abortController = new AbortController()` in `createMessage`; pass `signal: this.abortController.signal` to both `fetch` calls; cancel it in `abort()`.
   - *Effort*: S. *Risk*: low.
2. **Move PoW solver to a Worker thread** (`pow-solver.ts:71-83`).
   - *Why*: at difficulty 144000 it's 0.3s of frozen extension host **per turn × 2 (session-create + completion)**. Adversarial difficulty bumps could hit multi-second freezes.
   - *Where it goes*: new `pow-solver.worker.ts`; `solvePoW` becomes `solvePoWInWorker(ch): Promise<PoWAnswer>` using `node:worker_threads`. Keep the sync path as a fallback flag for tests.
   - *Effort*: M. *Risk*: low.
3. **Cache PoW headers within `expire_at`** — the challenge struct already declares its lifetime (`pow-solver.ts:11-12`) but the handler re-solves twice per turn.
   - *Why*: trivial 2× wall-clock saving on every turn; also reduces load on `create_pow_challenge`.
   - *Where it goes*: small LRU keyed by `target_path`; `getPoWHeader()` returns cached value while `Date.now() < expire_at * 1000 - safety_margin`.
   - *Effort*: S. *Risk*: low.
4. **Persist `chat_session_id` and `parent_message_id` to globalState** so a window reload mid-task survives.
   - *Why*: §4 — handler instances die on reload; the server keeps the session alive for far longer than the handler's lifetime. Loss of `parent_message_id` either resets context or sends to an out-of-sync server state.
   - *Where it goes*: new state keys `deepSeekWebApiActiveSession: {id, lastMessageId}` and equivalent for bridge; rehydrate in `createMessage` if `messages.length > 0` and the same task continues. See CLAUDE.md "Adding New Global State Keys" — six-step plumbing.
   - *Effort*: M. *Risk*: med (must not leak sessions across tasks).
5. **Wire mode flags into Path A's request body**: `thinking_enabled` and `search_enabled` (`handler.ts:248-249`) currently hard-coded to false despite the UI toolbar implying user control.
   - *Why*: §4 — silent UX failure when user toggles DeepThink on `deepseek-webapi`.
   - *Where it goes*: `handler.ts:241-250` — read `getBridgeOptions()` and merge `thinking_enabled: opts.deepThink`, `search_enabled: opts.search`.
   - *Effort*: XS. *Risk*: low (the field names are already documented by DeepSeek's own server when you call with them).
6. **Token-count estimation for the free paths** — wire a simple `tiktoken`/`gpt-tokenizer`-based estimator so `inputTokens`/`outputTokens` are real numbers, not zero.
   - *Why*: §4 — context-window indicators and budget guards are inert; users hit DeepSeek server-side context limits with no warning.
   - *Where it goes*: shared estimator in `src/core/api/transform/`; both custom handlers replace `inputTokens: 0` with the estimate.
   - *Effort*: M. *Risk*: low.
7. **Unit tests for the PoW solver and the 5-format SSE parser**. Both are deterministic and easy to fixture.
   - *Why*: zero coverage today on the most algorithmically interesting and brittle code in the fork.
   - *Where it goes*: `src/core/api/providers/deepseek-webapi/__tests__/pow-solver.test.ts` (known challenge → known nonce) and `sse-parser.test.ts` (fixtures of each Format A-E from real captures).
   - *Effort*: M. *Risk*: low.

### P1 — Should-have (gets us ahead)

1. **Retry decorator on both custom handlers** — port the `@withRetry()` pattern from `deepseek.ts:79`. Map DeepSeek error codes to a backoff policy (e.g. PoW-rejected → re-fetch challenge immediately; 429 → exponential).
2. **Schema-drift detector** — `ensureSession()` already tries four key paths (`handler.ts:208-214`). When the fallback ladder falls through, surface a one-time "DeepSeek schema may have changed — please update the extension" notification instead of an opaque thrown error.
3. **Per-window WebSocket bridge tenancy** — instead of one global `extensionWs`, allow `?windowId=...` query param so two VS Code windows can each pair to a different DeepSeek tab. Requires extension-side changes too.
4. **Honor DeepSeek's `expire_after` for the whole session**, not just the PoW header — proactively re-create the chat session before its server-side TTL.
5. **`isNextGenModelProvider` membership audit for `deepseek-webapi`** — once tool calling lands (P2), this needs to opt in to the native-tool-calling fast path. See CLAUDE.md "Responses API Providers" section.
6. **CLI parity** — add `deepseek-bridge` and `deepseek-webapi` to `cli/src/components/ModelPicker.tsx` `providerModels` map (consistent with the §4 finding from `API_PROVIDERS.md`).

### P2 — Nice-to-have (differentiators)

1. **Native tool calling on Path A** by either (a) sending OpenAI-style `tools[]` if DeepSeek's `/api/v0/chat/completion` accepts it, or (b) wrapping our XML tool spec in a thin JSON envelope detected by a system-prompt convention. Goal: drop dependency on XML tools for free-tier users.
2. **Headless / service mode for the bridge** — a CLI helper that opens a Playwright-driven Chromium with the extension preloaded, so the bridge can run without a manual browser tab. Frees the user from leaving chat.deepseek.com open.
3. **Bridge-vs-WebAPI auto-fallback** — if `deepseek-webapi` PoW fails 3× consecutively, transparently fall back to `deepseek-bridge` for the rest of the task with a UI banner.
4. **DeepSeek model coverage**: the bridge does not currently expose a model selector — the actual upstream DOM auto-routes between DeepSeek-V3 and DeepSeek-R1 based on the DeepThink toggle. Document this explicitly, and surface the inferred backend model in `ApiHandlerModel.info.description` after the first response.
5. **PoW telemetry** — record difficulty + solve-time per request to a local ring buffer; surface in a diagnostic panel so we can catch difficulty spikes proactively.
6. **Anti-abuse / ToS posture statement** — add a one-time disclosure dialog (and a setting `i_understand_chat_deepseek_tos_risk`) before the bridge activates, given DeepSeek's ToS almost certainly does not authorize automated agentic use.

## 7. Open Questions / أسئلة مفتوحة

- Does `chat.deepseek.com/api/v0/chat/completion` actually accept `tools: [...]`? No public docs found; would need empirical testing.
- What is the real server-side TTL on a `chat_session_id`? The challenge has `expire_at` / `expire_after`, but the session doesn't — only learned by hitting the failure case.
- Does the bridge path's pseudo-XML format (`<system>`, `<human>`, `<assistant>`) actually shape DeepSeek's behavior, or does the server strip XML tags? The handler treats them as natural-language scaffolding either way.
- Is the Chrome extension version `0.4.2` (per `BROWSER_BRIDGE.md` reference) pinned in any handshake? If not, a stale extension + new Node side can silently mis-handshake.
- The Arabic plan proposes archiving the bridge; the product kept it. **Should this doc trigger an update to `plans/deepseek-rest-api-integration.md` itself?** (Out of scope for this subagent's write permissions — but worth a "rec to user" surface.)

## 8. Change Log
| Date | Author | Change |
|---|---|---|
| 2026-05-11 | research-feature-analyst | Created — initial protocol-level analysis of DeepSeek integration; completes the trilogy (Handler / Transport / Protocol). |
