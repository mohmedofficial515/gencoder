# API Providers — Competitive Analysis
> Maintained by `research-feature-analyst`. Last updated: 2026-05-11.
> Sources verified this revision: `src/core/api/index.ts`, `src/core/api/providers/` (directory listing + `deepseek-bridge/index.ts`, `deepseek-bridge/ws-server.ts`, `deepseek-webapi/handler.ts`, `deepseek-webapi/pow-solver.ts`), `src/shared/api.ts:47-48,5066-5097`, `src/shared/providers/providers.json`, `src/shared/proto-conversions/models/api-configuration-conversion.ts:245-433`, `proto/cline/models.proto:419-466`, `extension/manifest.json`, `cli/src/components/ModelPicker.tsx:80-109`, `webview-ui/src/components/settings/utils/providerUtils.ts:129-392`, `plans/deepseek-rest-api-integration.md` (header), `CHANGELOG.md` (DeepSeek history).

## 1. Overview / نظرة عامة

GenCoder's API-provider layer is a switch-driven factory (`createHandlerForProvider` in `src/core/api/index.ts:78-482`) that returns a streaming `ApiHandler` per provider string. It inherits Cline's ~40+ upstream providers and adds **two GenCoder-only handlers** — `deepseek-bridge` (DOM-scraped chat.deepseek.com via a Chrome extension + local WebSocket relay on port 9876) and `deepseek-webapi` (direct HTTPS to chat.deepseek.com using bearer token + on-device SHA3-256 proof-of-work). Together these are GenCoder's free-tier flagship: they let users drive DeepSeek V3 / R1 in agentic flows without paying for any API key.

The handler interface (`src/core/api/index.ts:55-60`) is intentionally minimal: `createMessage(systemPrompt, messages, tools?, useResponseApi?) → ApiStream`, plus `getModel()` and optional `getApiStreamUsage()` / `abort()`. Tool calling, reasoning streams, prompt caching, and the Plan/Act dual-config split are all layered on top of that primitive.

## 2. Current State in GenCoder / الوضع الحالي

- **Factory entry point**: `src/core/api/index.ts:78-482` — single switch over `apiProvider` string with `default: AnthropicHandler` fallback at lines 471-481 (the silent-reset trap CLAUDE.md warns about).
- **Provider count**: **44 provider strings** registered (`anthropic`, `openrouter`, `bedrock`, `vertex`, `openai`, `ollama`, `lmstudio`, `gemini`, `openai-native`, `openai-codex`, `deepseek`, `requesty`, `fireworks`, `together`, `qwen`, `qwen-code`, `doubao`, `mistral`, `vscode-lm`, `cline`, `litellm`, `moonshot`, `huggingface`, `nebius`, `asksage`, `xai`, `sambanova`, `cerebras`, `groq`, `baseten`, `sapaicore`, `claude-code`, `huawei-cloud-maas`, `dify`, `vercel-ai-gateway`, `zai`, `oca`, `aihubmix`, `minimax`, `hicap`, `nousResearch`, `wandb`, **`deepseek-bridge`**, **`deepseek-webapi`**). The two bold entries are fork-original.
- **Provider files**: `src/core/api/providers/*.ts` — one file per provider; the two custom DeepSeek providers each live in their own folder (`deepseek-bridge/`, `deepseek-webapi/`).
- **Proto enum**: `proto/cline/models.proto:421-466` — `ApiProvider` enum, `DEEPSEEK_BRIDGE = 42` and `DEEPSEEK_WEBAPI = 43` added at the tail; `WANDB = 41` and `OPENAI_CODEX = 40` precede.
- **Proto round-trip maps**: `src/shared/proto-conversions/models/api-configuration-conversion.ts:245-338` (string→proto) and `:341-433` (proto→string). Both DeepSeek custom providers are correctly wired into both maps (lines 293-296 and 389-392), so the silent-reset-to-Anthropic gotcha from CLAUDE.md is verified-clean for the fork's own providers.
- **Dropdown order** (`src/shared/providers/providers.json`): `deepseek-bridge` and `deepseek-webapi` are positioned **first** in the list, ahead of Cline, ChatGPT, Gemini, OpenAI, and Anthropic — clear product positioning that the free DeepSeek path is the headline option.
- **Model metadata** (`src/shared/api.ts:5066-5097`): `deepSeekBridgeModels` advertises 131,072-token context, `supportsImages: true`, `inputPrice/outputPrice: 0`; `deepSeekWebApiModels` is identical except `supportsImages: false`. Both have `supportsPromptCache: false`.
- **Browser-extension bridge**: `extension/manifest.json` (v0.4.2, MV3) injects `injected.js` and `content.js` into `chat.deepseek.com`, with host permissions for `http://127.0.0.1:9876/*` and `ws://127.0.0.1:9876/*`. The extension service-worker (`extension/background.js`) is what shuttles bearer tokens + DOM-streamed text to the local WebSocket server (`src/core/api/providers/deepseek-bridge/ws-server.ts:6-7`, port 9876, path `/ws/deepseek-bridge`).
- **PoW solver**: `src/core/api/providers/deepseek-webapi/pow-solver.ts:71-83` — SHA3-256 over `challenge + salt + nonce`, comparing first 4 bytes as big-endian uint32 against `floor(2^32 / difficulty)`. Uses `@noble/hashes/sha3.js` (line 1) explicitly because Electron's bundled OpenSSL on some platforms lacks SHA3.
- **Bridge session machine**: `deepseek-bridge/index.ts:70-217` — tracks `sessionId`, `sentMessageCount`, `contextLost`, and `lastChatId`, with a `bridgeBus` `EventEmitter` listening for `chat_id_changed`, `context_lost`, `new_chat_clicked` so a user clicking "New Chat" in the actual DeepSeek tab cleanly resets agent state. **Delta sending**: subsequent turns only ship messages added since `sentMessageCount`, leaning on DeepSeek's server-side history (line 235 in the webapi handler explicitly comments "DeepSeek stores the conversation server-side").
- **Webapi session**: `deepseek-webapi/handler.ts:191-219` creates a `chat_session_id` once via `POST /api/v0/chat/create_chat_session`, then uses `parent_message_id` chaining (line 244) plus `lastMessageId += 2` (line 316).
- **CLI wiring**: `cli/src/components/ModelPicker.tsx:80-109` — `providerModels` map **does NOT include** `deepseek-bridge` or `deepseek-webapi`. `hasStaticModels()` therefore returns `false` and the CLI cannot show defaults for the fork's flagship providers. (See §4.)
- **Webview wiring**: `webview-ui/src/components/settings/providers/DeepSeekBridgeProvider.tsx` and `DeepSeekWebApiProvider.tsx` exist; `webview-ui/src/components/chat/BridgeModeToolbar.tsx` controls `deepThink` / `search` / `responseMode` (instant vs expert) — surfaces wire through `setBridgeOptions()` in `ws-server.ts:37-39`.
- **User-facing surface**: dropdown values "DeepSeek (Free Bridge)" and "DeepSeek (Web API - Direct)"; popup/UI provided by the Chrome extension (`extension/popup.html`).
- **Tests**: ❌ no coverage found. `src/core/api/providers/__tests__/` exists but contains no `deepseek-bridge` or `deepseek-webapi` files (only `gemini-mock.test.ts` lives directly in `providers/`). `test-bridge-ws.mjs` and `test_bridge.py` at repo root look like manual smoke scripts, not CI tests.
- **Plan**: `plans/deepseek-rest-api-integration.md` (Arabic, 552 LOC) calls out that the bridge is "unofficial, possibly unstable" and proposes replacing the WebSocket path with the official OpenAI-compatible DeepSeek REST API as v2.0 — **partially done** (the `deepseek` provider already exists upstream-Cline-style, but the plan was to phase out the bridge; bridge is still default).

## 3. Advantages / المميزات الحالية

- ✅ **Genuinely free DeepSeek V3/R1 with a 131k context window in an agent loop** — no other open VS-Code agent ships this out-of-the-box. *Evidence*: `src/shared/api.ts:5068-5076`, `src/shared/providers/providers.json:3-10`.
- ✅ **Two independent free paths** (DOM bridge and direct web API w/ PoW) give failover — if DeepSeek changes the SSE schema the webapi handler keeps working, and vice versa. *Evidence*: parallel handlers in `deepseek-bridge/index.ts` and `deepseek-webapi/handler.ts`.
- ✅ **PoW solved in-process via `@noble/hashes`** — works on Electron builds where native crypto lacks SHA3-256; sub-second average (the handler logs `~0.3s` at difficulty 144000). *Evidence*: `deepseek-webapi/pow-solver.ts:1,68-83`, `deepseek-webapi/handler.ts:225-228`.
- ✅ **Robust SSE parser handles five DeepSeek payload formats** (full snapshot, OpenAI-style delta, fragment append, content delta, choices-path delta) plus reasoning streams. *Evidence*: `deepseek-webapi/handler.ts:32-153`.
- ✅ **Delta-sending session model** avoids re-shipping conversation history each turn, halving uplink bytes on long agent loops. *Evidence*: `deepseek-bridge/index.ts:107-116`, `deepseek-webapi/handler.ts:230-239`.
- ✅ **Context-loss recovery via event bus** — `bridgeBus.on("context_lost" | "new_chat_clicked")` makes the handler resilient to the user manually clicking around in the DeepSeek tab. *Evidence*: `deepseek-bridge/index.ts:80-102, 213-216`.
- ✅ **Proto round-trip is correct for fork-original providers** — both `DEEPSEEK_BRIDGE` and `DEEPSEEK_WEBAPI` appear in both `convertApiProviderToProto` and `convertProtoToApiProvider`, so the silent-reset-to-Anthropic trap is dodged. *Evidence*: `api-configuration-conversion.ts:293-296, 389-392`.
- ✅ **Proxy-aware HTTP** — both DeepSeek handlers use `@/shared/net` `fetch` wrapper, complying with the project's networking rules. *Evidence*: `deepseek-webapi/handler.ts:3`, `deepseek-webapi/pow-solver.ts:2`.

## 4. Disadvantages & Gaps / العيوب والثغرات

- ⚠ **No CLI support for the fork's flagship providers** — `cli/src/components/ModelPicker.tsx:80-109` `providerModels` map omits both `deepseek-bridge` and `deepseek-webapi`. CLI users cannot select them via `hasStaticModels()`-gated UI paths. *Evidence*: `ModelPicker.tsx:80-109` (verified line-by-line; only standard providers listed).
- ⚠ **No automated test coverage** for either DeepSeek custom provider. Both handlers contain non-trivial state machines (delta-mode, session ID chaining, context-loss recovery, multi-format SSE parsing) with **zero unit/integration tests**. *Evidence*: directory listing of `src/core/api/providers/__tests__/` shows no matching files; `test-bridge-ws.mjs`/`test_bridge.py` are manual scripts at repo root.
- ⚠ **No native tool calling** for either custom provider — `createMessage` ignores the `tools?` param (`deepseek-bridge/index.ts:104`, `deepseek-webapi/handler.ts:221`). All tool use therefore routes through GenCoder's XML tool variant, which means slower/longer prompts and weaker tool-arg discipline than Anthropic/OpenAI-Responses paths get. *Evidence*: handler signatures.
- ⚠ **No prompt caching** — both models declare `supportsPromptCache: false`. With a 131k context and long agent transcripts, repeated system prompts are paid for (in wall-clock and DeepSeek server load) every turn. *Evidence*: `src/shared/api.ts:5071, 5087`.
- ⚠ **No usage / token accounting** — both handlers yield `{ inputTokens: 0, outputTokens: 0, totalCost: 0 }` (`deepseek-bridge/index.ts:194-201`, `deepseek-webapi/handler.ts:322`). Telemetry, context-window indicators, and the budget guardrails everything else in Cline relies on are inert for these providers.
- ⚠ **Hard dependency on a single port + tab being open** — bridge handler throws `"Chrome extension not connected"` (`ws-server.ts:82`) and webapi handler throws `"open chat.deepseek.com with the GenCoder extension active"` (`handler.ts:166-167`) if credentials are stale. There is no headless / "service" mode.
- ⚠ **Bridge is hard-coded to port 9876** (`ws-server.ts:6`) — no fallback, no config. Any collision with another local service breaks startup silently.
- ⚠ **WebSocket request timeout is 120s, fixed** (`ws-server.ts:8`) — long agentic tasks that exceed this fail with a generic "DeepSeek bridge request timed out after 2 minutes" rather than chunked / heartbeated continuation.
- ⚠ **No retry / back-off** in either DeepSeek handler — a single failed `POST /completion` (4xx, 5xx, network blip) surfaces as a thrown error and aborts the task. Other handlers in the fork (e.g. `anthropic.ts`) have `onRetryAttempt` plumbing.
- ⚠ **PoW solver runs on the main thread** — `solvePoW()` is a tight CPU loop (`pow-solver.ts:71-83`). At difficulty 144000 it's ~0.3s, but adversarial difficulty bumps could freeze the extension host. No worker / async-yield.
- ⚠ **`extension/` Chrome extension version (0.4.2) is not pinned** anywhere in the VS Code extension manifest — if DeepSeek changes its DOM/API and an old browser-extension version is installed, the user sees opaque parser errors with no version-mismatch warning.
- ⚠ **The "Free Bridge" UX hides risk**: DeepSeek's ToS for chat.deepseek.com almost certainly does not authorize automated agentic use. This is a legal/policy footgun not surfaced in any user-facing copy. *Evidence*: no Terms-of-Service warning string found in `extension/popup.html` or webview providers.
- ⚠ **Bridge channel name is single-tenant** — `WS_PATH = "/ws/deepseek-bridge"` with one `extensionWs` ref (`ws-server.ts:47`). Two VS Code windows can't both bridge simultaneously; the second one steals the socket.
- ⚠ **No `isNextGenModelProvider` membership** — the DeepSeek custom providers can't opt into the native-tool-calling fast path even if DeepSeek's web API later supports it. *Evidence*: CLAUDE.md note on `src/utils/model-utils.ts`; both DeepSeek custom handlers also lack `apiFormat: ApiFormat.OPENAI_RESPONSES`.
- ⚠ **The Arabic plan (`plans/deepseek-rest-api-integration.md`) is stale** — it proposes replacing the bridge with REST API as v2.0, but the bridge remains the headline option in `providers.json`. Roadmap drift not reconciled.

## 5. Competitor Landscape / المقارنة مع المنافسين

| Competitor | Their approach | Better / Worse than GenCoder | Source |
|---|---|---|---|
| **Cline (upstream)** | ~30+ official providers via the same factory pattern (Anthropic, OpenRouter, OpenAI, Gemini, Bedrock, Vertex, Cerebras, Groq, Ollama, LM Studio, any OpenAI-compatible). No DeepSeek-via-web-scrape; users pay for DeepSeek API key. | **GenCoder strictly extends** — same architecture plus two free DeepSeek paths. But upstream has more tests, more polish per provider, and benefits from upstream maintenance GenCoder must merge. | github.com/cline/cline + this repo's `src/core/api/providers/` listing |
| **Cursor** | First-party billing through Cursor's AWS backend; "Auto" model router + `Composer 2` proprietary model. BYOK exists but **all traffic still flows through Cursor's servers** — no air-gap, no privacy escape hatch. No free DeepSeek path. | Cursor is more polished and ships a tuned router; GenCoder wins on **truly self-hosted** routing + free DeepSeek. Cursor is closed-source. | https://cursor.com/docs/models-and-pricing , https://future-stack-reviews.com/cursor-review/ |
| **Windsurf (Codeium)** | Multi-model (Claude 4.x, GPT-5.1 family, Gemini 3 Pro, SWE-1.5) routed through Codeium infra; **BYOK only for the Claude 4 family** and Cascade-mode. No local-only mode, no free DeepSeek. | Windsurf has better proprietary models (SWE-1.5) and Codemaps UX, but BYOK is much more limited than GenCoder's any-provider model. | https://docs.windsurf.com/windsurf/models , https://windsurf.com/changelog |
| **Continue.dev** | `config.yaml` declares providers explicitly: Ollama, LM Studio, llama.cpp, any OpenAI-compatible endpoint, Anthropic/OpenAI/Gemini direct. AUTODETECT mode for local Ollama. No DeepSeek-web-scrape — official API only. | Continue's config-as-code model is more flexible than GenCoder's enum-bound switch; GenCoder wins on free DeepSeek and on having a far richer in-IDE chat/agent UX. | https://docs.continue.dev/customize/model-providers/overview , https://docs.continue.dev/reference |
| **Aider** | Uses **LiteLLM** under the hood → 75+ providers automatically, any OpenAI-compatible endpoint, local models, env-var-driven. No DeepSeek-web-scrape; official DeepSeek API via key. | Aider's LiteLLM strategy gives it provider count that GenCoder will never match via the switch-statement approach. GenCoder wins on agentic VS Code UX and free DeepSeek. | https://aider.chat/docs/llms.html , https://aider.chat/docs/llms/openai-compat.html |
| **GitHub Copilot CLI (agent mode)** | As of April 2026 supports BYOK via three env vars (`COPILOT_PROVIDER_TYPE`, `COPILOT_PROVIDER_BASE_URL`, `COPILOT_PROVIDER_API_KEY`) for Anthropic, Azure OpenAI, or any OpenAI-compatible endpoint. Offline mode (`COPILOT_OFFLINE=true`) disables all telemetry. Built-in sub-agents inherit the provider. | Copilot CLI just caught up on BYOK + local; offline mode is a cleaner story than GenCoder's. GenCoder wins on free DeepSeek and on extension-vs-CLI parity (Copilot CLI is terminal-only for BYOK). | https://github.blog/changelog/2026-04-07-copilot-cli-now-supports-byok-and-local-models/ , https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models |
| **Roo Code / Kilo Code** | Cline forks; same factory architecture, comparable provider counts. No public DeepSeek-web-scrape. | ⚠ unverified — based on common knowledge as of 2026-05-11. Likely comparable to GenCoder minus the DeepSeek free paths. | Cline fork lineage (no specific source fetched this turn) |

## 6. Recommended Additions / مميزات مقترحة للإضافة

### P0 — Must-have (blocks parity)

1. **Wire `deepseek-bridge` and `deepseek-webapi` into the CLI's `providerModels` map.** Currently CLI users literally cannot pick GenCoder's flagship providers via `hasStaticModels()` paths.
   - *Why*: Gap from §4 bullet 1; violates the CLI parity rule in `.clinerules/cli.md`.
   - *Where it goes*: `cli/src/components/ModelPicker.tsx:80-109` — add two lines importing `deepSeekBridgeModels/deepSeekBridgeDefaultModelId` and `deepSeekWebApiModels/deepSeekWebApiDefaultModelId` from `@shared/api`.
   - *Effort*: S. *Risk*: low.

2. **Add unit + integration tests for the two DeepSeek handlers.** At minimum: PoW correctness (a known challenge → expected nonce), SSE parser coverage for all 5 formats, delta-mode state machine on session reset.
   - *Why*: Gap from §4 bullet 2; current setup has zero test coverage on state-heavy code that breaks every time DeepSeek tweaks SSE/DOM.
   - *Where it goes*: new files under `src/core/api/providers/__tests__/deepseek-bridge.test.ts` and `deepseek-webapi.test.ts`; reuse `mockFetchForTesting` from `@/shared/net` per `.clinerules/network.md`.
   - *Effort*: M. *Risk*: low.

3. **Retry + exponential back-off on transient HTTP failures** in both DeepSeek handlers, mirroring the `onRetryAttempt` plumbing already threaded through `index.ts` for the other handlers.
   - *Why*: Gap from §4 bullet 9; one network blip currently aborts the whole agentic task.
   - *Where it goes*: wrap `fetch(COMPLETION_URL, …)` in `deepseek-webapi/handler.ts:252` and the `sendPrompt` call in `deepseek-bridge/index.ts:151` with an `attemptedFetch` helper; surface attempts via `onRetryAttempt`.
   - *Effort*: S. *Risk*: low.

### P1 — Should-have (gets us ahead)

1. **Bridge port + WS path become config-driven** with auto-fallback. Add `deepseekBridgePort` to global state (per CLAUDE.md "Adding New Global State Keys" checklist) and try a sequence (9876 → 9877 → 9878) on EADDRINUSE.
   - *Why*: Gap from §4 bullets 7-8; single-tenant + hard-coded port is fragile.
   - *Where it goes*: `ws-server.ts:6-7`, plus `src/shared/storage/state-keys.ts`, `src/core/storage/utils/state-helpers.ts`, `updateSettings.ts` / `updateSettingsCli.ts`.
   - *Effort*: M. *Risk*: med (cross-window state semantics).

2. **Move PoW solver to a worker thread** (or chunked `setImmediate` yields) so the main thread doesn't stall at higher difficulties.
   - *Why*: Gap from §4 bullet 11; future-proofing if DeepSeek bumps difficulty.
   - *Where it goes*: `deepseek-webapi/pow-solver.ts` — wrap `solvePoW` in a `Worker` (`worker_threads`) instance with a 50ms timeslice fallback.
   - *Effort*: M. *Risk*: low.

3. **Surface a Terms-of-Service / unofficial-API warning** in both DeepSeek provider settings panes + first-run dialog. Users should explicitly acknowledge the bridge is unofficial.
   - *Why*: Gap from §4 bullet 13; legal hygiene, also matches how Cursor/Copilot disclose data flows.
   - *Where it goes*: `webview-ui/src/components/settings/providers/DeepSeekBridgeProvider.tsx`, `DeepSeekWebApiProvider.tsx`; add a one-time-accepted state key.
   - *Effort*: S. *Risk*: low.

4. **Pin and version-check the Chrome extension.** Have `ws-server.ts` reject WS handshakes from extension versions older than a minimum and surface a `vscode.window.showWarningMessage`.
   - *Why*: Gap from §4 bullet 12; opaque parser errors on stale extension is a top support burden.
   - *Where it goes*: `extension/background.js` sends `version` in the handshake; `ws-server.ts:setBridgeCredentials` validates against `MIN_BRIDGE_VERSION` constant.
   - *Effort*: S. *Risk*: low.

5. **Native tool calling for DeepSeek REST (`deepseek` provider) + plumb DeepSeek-web-API when DeepSeek ships function-call SSE**. Add `deepseek` (the REST provider) to `isNextGenModelProvider()` and gate behind a feature flag.
   - *Why*: Gap from §4 bullet 14; XML tool variant is markedly slower.
   - *Where it goes*: `src/utils/model-utils.ts`; per-model `apiFormat` field in `src/shared/api.ts` `deepSeekModels`.
   - *Effort*: M. *Risk*: med.

### P2 — Nice-to-have (differentiators)

1. **Provider-as-config: ship a LiteLLM-style YAML adapter.** Today GenCoder users must add a TypeScript file + 8 wiring locations per provider. A `~/.gencoder/providers.yaml` that registers OpenAI-compatible endpoints at runtime would eat Aider's "75+ providers" advantage. *Effort*: L.

2. **Free-tier router**: a meta-provider `gencoder-free-auto` that tries `deepseek-webapi` first, falls back to `deepseek-bridge`, then to OpenRouter free models on failure. Sells the "free" story without locking the user into one path. *Effort*: M.

3. **Headless/service mode for the bridge** — package the WebSocket server + a minimal Puppeteer/Playwright instance of chat.deepseek.com so users on servers (no browser) can still use the free tier. *Effort*: L. *Risk*: high (DeepSeek anti-bot).

4. **Token / usage estimation** even for free providers — count input chars × ~0.25 token-per-char heuristic and emit a synthetic `usage` chunk so context-window UI and budget guards work. *Effort*: S.

5. **Prompt-cache simulation client-side** — hash system prompt + tool defs; if unchanged from previous turn, prepend a short "system prompt unchanged, see prior turn" sentence rather than the full 8k system message. DeepSeek server-side has no cache API, but the bridge already implicitly does this via the chat-session ID — make it explicit. *Effort*: M.

## 7. Open Questions / أسئلة مفتوحة

- Is the Arabic plan `plans/deepseek-rest-api-integration.md` still the source of truth for roadmap? Bridge was supposed to phase out for the official REST API in v2.0; current dropdown order says the opposite.
- Should `deepseek-bridge`/`deepseek-webapi` be moved out of the upstream-Cline `providers.json` and into a fork-local file to reduce merge conflicts with upstream Cline?
- What's the policy for the Chrome extension's distribution? `extension/manifest.json` shows v0.4.2 but there's no published Chrome Web Store listing referenced anywhere in the repo.
- Should the proto enum positions (`DEEPSEEK_BRIDGE = 42`, `DEEPSEEK_WEBAPI = 43`) be moved into a fork-reserved range (e.g. 1000+) so upstream Cline can keep claiming 40-99 without collision?

## 8. Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-10 | (initial) | Generic API-provider documentation seeded from upstream Cline patterns. |
| 2026-05-11 | research-feature-analyst | Full rewrite into 8-section competitive-analysis template. §2 grounded in verified file/line references (44 providers verified, both DeepSeek custom paths fully audited, proto round-trip confirmed clean, CLI gap identified). §5 competitor table populated with WebSearch-sourced 2026 data for Cursor / Windsurf / Continue / Aider / Copilot CLI. §6 added 3 P0 / 5 P1 / 5 P2 recommendations. |
