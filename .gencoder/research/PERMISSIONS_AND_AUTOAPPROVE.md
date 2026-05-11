# Permissions & Auto-Approve — Competitive Analysis
> Maintained by `research-feature-analyst`. Last updated: 2026-05-11.
> Sources verified: `src/shared/AutoApprovalSettings.ts`, `src/core/task/tools/autoApprove.ts`, `src/core/permissions/CommandPermissionController.ts`, `src/core/permissions/types.ts`, `src/core/task/tools/handlers/ExecuteCommandToolHandler.ts`, `src/core/task/tools/handlers/UseMcpToolHandler.ts`, `webview-ui/src/components/chat/auto-approve-menu/constants.ts`, `webview-ui/src/components/chat/auto-approve-menu/AutoApproveBar.tsx`, `webview-ui/src/components/chat/auto-approve-menu/types.ts`, `webview-ui/src/hooks/useAutoApproveActions.ts`, `webview-ui/src/components/settings/sections/FeatureSettingsSection.tsx`, `src/core/prompts/system-prompt/tools/execute_command.ts`, `proto/cline/state.proto`, `src/shared/storage/state-keys.ts`.

## 1. Overview / نظرة عامة

The permissions layer gates every potentially-impactful tool call (file reads/writes, terminal execution, browser actions, MCP calls, web fetches) behind a tiered approval system. The user controls **what** runs without prompting and **what** always asks via a granular settings surface ("Auto-approve" menu) and three escalation tiers: per-action toggles, an "auto-approve all" master switch, and a "YOLO" no-questions mode. A separate environment-variable layer (`CLINE_COMMAND_PERMISSIONS`) provides regex/glob allow+deny lists for terminal commands that are evaluated **before** any auto-approve check.

طبقة الصلاحيات تتحكم في كل أداة قد تكون مؤثرة (قراءة/كتابة الملفات، تنفيذ أوامر، المتصفح، MCP، جلب الويب) عبر نظام موافقة متدرج. المستخدم يحدد ما يعمل تلقائياً وما يحتاج موافقة عبر قائمة "Auto-approve" مع ثلاث طبقات تصعيد، بالإضافة إلى طبقة منفصلة عبر متغير البيئة `CLINE_COMMAND_PERMISSIONS` لقوائم سماح/منع الأوامر.

## 2. Current State in GenCoder / الوضع الحالي

**Auto-approve data model** (`src/shared/AutoApprovalSettings.ts:1-44`): A flat `AutoApprovalSettings` object with `version`, legacy fields (`enabled`, `favorites`, `maxRequests`), an `actions` map, and an `enableNotifications` flag. The current action keys are:

- `readFiles` (project) + `readFilesExternally` (outside workspace) — `L15-16`
- `editFiles` (project) + `editFilesExternally` — `L17-18`
- `executeSafeCommands` + `executeAllCommands` — `L19-20`
- `useBrowser` — `L21`
- `useMcp` — `L22`

Defaults at `L28-44`: `readFiles=true`, `executeSafeCommands=true`, `useMcp=true`. Edits, external reads, all-commands, and browser default to `false`. Notifications default `false`. Comments at `L4-12` note that `enabled`, `favorites`, and `maxRequests` are legacy/no-op kept for back-compat — auto-approve is "now always enabled by default".

**Approval-routing core** (`src/core/task/tools/autoApprove.ts`): Class `AutoApprove` exposes `shouldAutoApproveTool(toolName)` and `shouldAutoApproveToolWithPath(toolName, path)`.

- `shouldAutoApproveTool` (`L42-117`) returns either a `boolean` or a `[boolean, boolean]` tuple — the tuple's second element is the "external/all" tier (e.g., readFiles + readFilesExternally, editFiles + editFilesExternally, executeSafe + executeAll).
- Three precedence layers, checked top-down:
  1. **`yoloModeToggled`** (`L43-64`) — auto-approves every tool family including BASH/FILE_EDIT/USE_SUBAGENTS and browser/MCP. Returns `[true, true]` for tuple tools.
  2. **`autoApproveAllToggled`** (`L66-86`) — same effect as YOLO but distinct flag.
  3. **Per-action `autoApprovalSettings.actions.*`** (`L88-115`) — the granular path.
- Path-sensitive variant `shouldAutoApproveToolWithPath` (`L122-167`) detects whether a target path is inside the workspace, then requires only `local=true` for in-workspace and `local=true AND external=true` for out-of-workspace. Multi-root workspaces are handled at `L138-140` (file is in *any* root).

**Per-tool wiring (the integrators):**
- Execute command — `ExecuteCommandToolHandler.ts:192-279`. The model emits `requires_approval: "true"|"false"` as a tool parameter (`L89-90`); approval logic at `L223-227` is: auto-approve if `(!requiresApproval && executeSafeCommands)` OR `(requiresApproval && executeSafeCommands && executeAllCommands)`. So the LLM self-classifies and the user's two toggles map to "approve safe-as-marked" vs "approve everything".
- MCP — `UseMcpToolHandler.ts:118` falls through to manual `askApprovalAndPushFeedback("use_mcp_server", ...)` whenever auto-approve denies; verified `L115-119`.
- Browser, web search, web fetch — all gated by the single `useBrowser` flag (`autoApprove.ts:107-111`).

**Terminal command permissions layer** (`src/core/permissions/CommandPermissionController.ts:1-385`):
- Reads `CLINE_COMMAND_PERMISSIONS` env var (`types.ts:32`).
- JSON shape: `{ allow: string[], deny: string[], allowRedirects: boolean }` (`types.ts:4-8`).
- Glob-style patterns where `*` matches any characters including `/` and newlines (`L300-311`), `?` matches one.
- Deny rules checked first, then allow rules; if allow list is non-empty and nothing matches → deny by default (`L164-186`).
- **Chained command parsing** (`L189-281`) via `shell-quote`: splits on `&&`, `||`, `|`, `;`; recursively walks subshells `(...)`; flags redirects `>`, `>>`, `<`. Every segment must independently pass.
- **Dangerous-character guard** (`L333-383`): rejects newlines and backticks outside appropriate quote contexts, which would otherwise let chained commands smuggle past the segment validator.
- Called from `ExecuteCommandToolHandler.ts:161-181` **before** the auto-approve check — so even a YOLO user can be blocked by an env-configured deny list.
- If env var is unset, `parseConfig()` returns `null` (`L52-69`) and `validateCommand` short-circuits to `allowed: true` (`L78-82`) — backward-compatible.

**LLM-side risk hint** (`src/core/prompts/system-prompt/tools/execute_command.ts:17-24, 50-56, 78-83`): All variants require the model to emit a `requires_approval` boolean parameter for every command. Definition at `L20-22`: "Set to 'true' for potentially impactful operations like installing/uninstalling packages, deleting/overwriting files, system configuration changes, network operations…". This is the **only** built-in risk classifier — it lives in the LLM's judgment, not in code.

**UI surface:**
- `AutoApproveBar.tsx` lives above the chat input. `L24-63` renders the comma-separated list of enabled action short-names (Read, Edit, Safe Commands, Browser, MCP). YOLO mode at `L70-113` replaces the bar entirely with a disabled "Auto-approve: YOLO" warning plus an in-place link to Settings.
- `AutoApproveModal.tsx` + `AutoApproveMenuItem.tsx` (referenced from the bar at `L168-173`) render the per-action toggles, sourced from `constants.ts:3-55` `ACTION_METADATA`.
- Parent/sub-action logic in `useAutoApproveActions.ts:34-45`: turning a parent off forces sub off; turning a sub on auto-enables the parent.
- Settings sidebar surface in `FeatureSettingsSection.tsx:116-120, 232, 250` defines the YOLO toggle and locks it to a remote-config value when an org admin has overridden it (`isYoloRemoteLocked`).

**State plumbing:**
- `yoloModeToggled` and `autoApproveAllToggled` are global settings keys with defaults `false` (`state-keys.ts:265-266`).
- `autoApprovalSettings` is a structured global state object.
- Updates route through `src/core/controller/state/updateAutoApprovalSettings.ts` (webview) and `src/core/controller/state/updateSettings.ts` / `updateSettingsCli.ts` (CLI/ACP) — version-bumped on every change for race-condition prevention (`AutoApprovalSettings.ts:2-3`).

**CLI surface:** `cli/src/components/SettingsPanelContent.tsx` is the only CLI file currently referencing `executeSafeCommands` (verified Grep hit) — the CLI panel renders the same auto-approve toggles. ⚠ unverified whether the CLI exposes YOLO mode and the command-permissions env var with full parity.

## 3. Advantages / المميزات الحالية

- **Granular per-action surface.** Five action families, three of which have a project-vs-external tier (`AutoApprovalSettings.ts:15-22`). The user can auto-approve project reads while still requiring approval for `~/.ssh` reads. Most consumer-grade competitors (Copilot, Continue default) are coarser.
- **Tiered escalation.** Per-action → "approve all" → YOLO is a clear ladder; the bar always reflects the active tier and YOLO is visually distinct (red banner, `AutoApproveBar.tsx:70-113`).
- **LLM-supplied risk classification for commands.** Tool spec at `execute_command.ts:18-22` forces the model to label each command, and the handler at `ExecuteCommandToolHandler.ts:223-227` requires BOTH safe AND all-commands toggles for a model-flagged-risky command. Coarser than a static allowlist but adaptive.
- **Live status surface.** `AutoApproveBar.tsx:24-63` shows the comma-separated enabled actions above every prompt — the user always sees what their next message will run without confirmation.
- **Path-aware approval** (`autoApprove.ts:122-167`) — same toggle behaves differently for in-workspace vs out-of-workspace targets; multi-root respected.
- **Env-based deny list.** `CommandPermissionController.ts` is a real differentiator: regex/glob allow+deny, deny-first precedence, multi-segment parsing with subshell recursion, dangerous-character detection (newlines/backticks). This layer runs **before** auto-approve, so an org admin can hard-block commands a user has YOLO'd. Roo Code and Kilo Code expose per-command lists in the UI; doing it via env var fits the enterprise/CI use case better.
- **Backward compatibility** — env var unset = old behavior (`CommandPermissionController.ts:79-82`); legacy `enabled`/`maxRequests` kept (`AutoApprovalSettings.ts:4-12`) — upgrades don't break.
- **Version-bumped settings** (`AutoApprovalSettings.ts:2-3`, `useAutoApproveActions.ts:49`) protect against last-write-wins races between webview and CLI editors.
- **Remote-config override** for orgs (`FeatureSettingsSection.tsx:232,250`) — YOLO can be locked off from a central policy.

## 4. Disadvantages & Gaps / العيوب والثغرات

- **Risk classification is delegated entirely to the LLM.** The `requires_approval` parameter on `execute_command` (`execute_command.ts:18-24`) is whatever the model decides. There is no static checker — `rm -rf /` is auto-approved if the model labels it `false` and the user has `executeSafeCommands=true`. No deterministic "always require" list inside the handler.
- **No in-UI command allowlist.** The deny-list lives only in `CLINE_COMMAND_PERMISSIONS` env var (`types.ts:32`). A normal VS Code user has no surface to add `rm *` to a deny list; they must edit shell rc files and restart VS Code. Roo/Kilo expose this in settings UI. ⚠ unverified that there's no UI route — see Open Questions.
- **YOLO and "approve all" are duplicate states.** `autoApprove.ts:43-86` shows two near-identical code paths. Maintenance burden + UI confusion (`FeatureSettingsSection.tsx:116-120` only documents YOLO).
- **Auto-approve never expires.** Once `useMcp=true`, it stays on forever across sessions and workspaces. No idle-timeout, no cool-down. After a destructive action runs, the next equally-destructive action runs immediately with no friction.
- **No audit log surface.** Tool calls are captured in `telemetryService.captureToolUsage` (`ExecuteCommandToolHandler.ts:234-243`) with a `didAutoApprove` flag, but there is no UI showing the user "during this task, these N things were auto-approved" after the fact. Users can't easily reconstruct what their agent did without scrolling.
- **No per-MCP-server approval.** `useMcp` is a single global flag (`AutoApprovalSettings.ts:22`). Sensitive MCPs (Postgres, AWS, Git) are auto-approved identically to harmless ones (filesystem-read MCP). MCP tool calls in `UseMcpToolHandler.ts` route through the same global gate.
- **Browser flag is overloaded.** `useBrowser=true` simultaneously auto-approves `browser_action`, `web_fetch`, and `web_search` (`autoApprove.ts:107-111`). The user has no way to allow web search but require approval for full browser sessions.
- **No diff-bounded write approval.** `editFiles` auto-approves a 1-line typo fix and a 5000-line rewrite identically.
- **No workspace-trust integration.** VS Code's built-in trust state is not consulted; `autoApprove.ts` reads no such flag.
- **DeepSeek Web bridge interplay** (cross-ref `BROWSER_BRIDGE.md` §4 P0): the bridge runs on loopback `127.0.0.1:9876` without auth. If auto-approve is enabled and the bridge port is compromised, model output is treated as user-trusted — including tool calls. There is no extra confirm tier for "actions originating from a network-attached model".
- **No deny-list defaults.** `CommandPermissionController` ships zero baked-in patterns. A user enabling `executeAllCommands` with no env var gets *literally no protection* against `rm -rf ~` short of the LLM tagging it.
- **Documentation is sparse.** The `CLINE_COMMAND_PERMISSIONS` feature is undocumented in user-facing docs (grep hits only the controller source and a planning doc).

## 5. Competitor Landscape / المقارنة مع المنافسين

| Competitor | Their approach | Better/Worse |
|---|---|---|
| **Cline upstream** | GenCoder inherits the entire surface (auto-approve menu, YOLO, command-permissions env var). No documented divergence in `src/core/task/tools/autoApprove.ts` or `CommandPermissionController.ts` versus upstream Cline. | parity |
| **Cursor** | Per-tool "Always allow" memory with confirmation modal; ships a small static deny list for high-risk patterns; reads VS Code workspace trust. ⚠ unverified — needs WebSearch. | likely stricter defaults, similar granularity |
| **Windsurf (Codeium)** | "Flow Actions" with explicit approval gates per cascade step. ⚠ unverified — WebSearch. | comparable granularity |
| **Continue.dev** | Manual run-button on every action by default; agent mode is opt-in per session. Very safe default. ⚠ unverified — their docs. | safer default, less ergonomic |
| **Aider** | CLI-only: `/yes` per-action, `--auto-commit` is opt-in. No granular per-tool auto-approve — the user types `y` per action. | safer per-step, no UI granularity |
| **GitHub Copilot Agent** | Stricter sandboxing model: agent runs in an ephemeral environment; tools run in a container with limited filesystem. Approval surface is coarse-grained at session level. ⚠ unverified — WebSearch. | safer by *sandbox*, not by *approval surface* |
| **Roo Code** | Adds in-UI per-command terminal allowlist (regex), per-MCP-server approval toggle, and "max requests before re-prompt" cap. ⚠ unverified — WebSearch + their GitHub. | likely ahead on terminal granularity and MCP scoping |
| **Kilo Code** | Same ancestry as Roo; comparable per-command allowlist. ⚠ unverified — WebSearch. | parity with Roo, ahead of GenCoder UI |
| **Augment** | Enterprise pitch with heavy guardrails — org-policy-driven allow/deny, audit log, ephemeral execution. ⚠ unverified — WebSearch. | ahead on audit + policy |
| **Zed AI** | Newer entrant; defaults to "agent edits are reviewed in diff before apply." ⚠ unverified — Zed docs. | safer for edits, no granular tool approval |

GenCoder advantage: the `CLINE_COMMAND_PERMISSIONS` env var with chained-command parsing, subshell recursion, and dangerous-character detection is more rigorous than what most competitors expose. Where competitors lead: in-UI surface for that allowlist, per-MCP scoping, and built-in audit log.

## 6. Recommended Additions / مميزات مقترحة للإضافة

### P0

- **Static deny list with no toggle.** Add a small hard-coded set of patterns inside `CommandPermissionController` that block regardless of env-var or auto-approve state: `rm -rf /`, `rm -rf ~`, `dd if=*`, `mkfs.*`, `:(){:|:&};:`, `sudo *`, `> /dev/sda*`, `git push -f * main`, `git push -f * master`. Surface the rejection in the chat UI with a clear "policy-denied" tag, no path to override without code change. Hooks in at `ExecuteCommandToolHandler.ts:161-181` next to the existing controller call.
- **Move command allow/deny into webview settings.** Today `CLINE_COMMAND_PERMISSIONS` is env-only (`types.ts:32`). Add an `AutoApprovalSettings.commandAllow: string[]` / `commandDeny: string[]` pair so users can manage patterns from the auto-approve modal. Continue to honor env var (it wins when both present) for org policy. Update proto (`state.proto:46-52`) and conversion layers.
- **Risk-classified terminal split — code-side, not LLM-side.** Today `executeSafeCommands` vs `executeAllCommands` relies on the LLM's `requires_approval` parameter (`execute_command.ts:18-24`). Add a static classifier in `CommandPermissionController` that pattern-matches the command into `read-only`, `mutating`, `destructive` tiers and feeds that classification into `ExecuteCommandToolHandler.ts:223-227` alongside the LLM's hint. Treat LLM-says-safe-but-classifier-says-destructive as `requires_approval=true`.
- **Auto-approve session timeout.** Add `AutoApprovalSettings.idleTimeoutMinutes?: number` (default `null = no timeout`). After N minutes without user input, downgrade to "ask everything" until the next user message. Implementation lives in `AutoApprove.shouldAutoApproveTool` — check `Date.now() - lastUserActivityAt` against the threshold.

### P1

- **Per-MCP-server approval policy.** Replace the single `useMcp` boolean (`AutoApprovalSettings.ts:22`) with a `useMcp: { [serverId]: "auto" | "ask" | "deny" }` map. Wire through `UseMcpToolHandler.ts:118` so policy lookup is per-call. Default new servers to `"ask"` so a freshly-installed MCP doesn't inherit blanket trust. Cross-ref `MCP_INTEGRATION.md` for the server registry.
- **Auto-approve audit log.** Persist the existing `telemetryService.captureToolUsage(..., didAutoApprove: true, ...)` events (`ExecuteCommandToolHandler.ts:234-243`) into task-scoped storage and surface a "Auto-approved this task" panel in the webview (and a CLI command `cline approvals --task <id>`). Each row: timestamp, tool, target, classification, why-auto-approved-was-true.
- **Cool-down on destructive actions.** After a command in the static-classifier "destructive" tier runs, the next `executeAllCommands` candidate within N seconds is forcibly downgraded to `requires_approval=true`. Tiny state in `TaskState`; check in `autoApprove.ts:42`.
- **Split browser flag.** Promote `useBrowser` into three flags: `useBrowserSession`, `useWebFetch`, `useWebSearch`. Routes already exist at `autoApprove.ts:107-111` — just stop collapsing them. Update modal + bar.
- **Plan-mode-as-unit approval.** When a plan finalizes, surface the plan diff as a single approval action; if approved, all child tool calls inside that plan run as if auto-approved for the plan's duration, *regardless* of the per-action settings. Pairs naturally with `FOCUS_CHAIN_AND_PLANS.md` (not yet authored).

### P2

- **VS Code workspace trust integration.** Refuse to enable any auto-approve action when `vscode.workspace.isTrusted === false`. Read it once at `AutoApprove` construction (`autoApprove.ts:15-17`). Doesn't apply to CLI.
- **Diff-bounded write auto-approve.** Add `editFilesMaxLines?: number` — auto-approve write_to_file/replace_in_file only when the resulting diff is ≤ N lines (`WriteToFileToolHandler.ts` integration point).
- **Cross-window approval sync.** If user has two GenCoder tasks open in parallel windows, broadcast auto-approve changes via the StateManager round-trip (see `STATE_MANAGEMENT.md` for the cross-window cache caveat).
- **Per-task auto-approve overrides.** Today auto-approve is workspace-global. Allow `/approvals task` to apply tighter (never looser) rules for a single task without touching workspace defaults.
- **Telemetry opt-in for anonymized approval patterns** — let users share "how often does the LLM mislabel destructive commands as safe?" data so the team can improve the prompt at `execute_command.ts:20-22`.

## 7. Open Questions / أسئلة مفتوحة

- Is there *any* current UI surface (settings panel or hidden command palette entry) for `CLINE_COMMAND_PERMISSIONS` that the grep missed? Verified env-only via `types.ts:32` + `CommandPermissionController.ts:52-69`, but a settings-side wiring may exist outside the obvious file names.
- Why do `yoloModeToggled` and `autoApproveAllToggled` coexist as separate flags (`state-keys.ts:265-266`)? `autoApprove.ts:43-86` treats them near-identically. Is one being deprecated, or is the difference UI-only (one shows the warning bar, the other is silent)? Confirmed YOLO replaces the bar (`AutoApproveBar.tsx:70-113`); ⚠ unverified what `autoApproveAllToggled` does UI-wise.
- Should plan mode reuse the same auto-approve flags or always require explicit confirmation regardless? Today `act_vs_plan_mode.ts` references YOLO but the interaction isn't documented in `autoApprove.ts`.
- Where should the audit log live — `.cline/audit/<taskId>.jsonl` (file) or in `globalState` (state-manager cache)? File is safer for forensics; state is faster.
- Should auto-approve preferences sync via VS Code Settings Sync, or stay machine-local for security?
- Multi-user devcontainer / VS Code Live Share — whose `autoApprovalSettings` apply when the second user's agent calls a tool?
- CLI parity: does the React Ink TUI fully expose YOLO and command-permissions surfacing? Only `executeSafeCommands` Grep-hit was `cli/src/components/SettingsPanelContent.tsx` — ⚠ unverified for completeness.
- DeepSeek Web bridge interplay: should auto-approve be force-disabled while the bridge is the active provider? See `BROWSER_BRIDGE.md` §4 (P0 loopback-auth gap) — if the bridge is compromised, the attacker rides on the user's auto-approve grants.

## 8. Change Log

- 2026-05-11 — Initial authoring. Verified `AutoApprovalSettings.ts`, `autoApprove.ts`, `CommandPermissionController.ts`, `ExecuteCommandToolHandler.ts`, `UseMcpToolHandler.ts`, `AutoApproveBar.tsx`, `constants.ts`, `useAutoApproveActions.ts`, `FeatureSettingsSection.tsx`, `execute_command.ts`, `state.proto`, `state-keys.ts`. Linked P0 #4 (DeepSeek bridge interplay) to `BROWSER_BRIDGE.md` §4 P0 (loopback-auth).
