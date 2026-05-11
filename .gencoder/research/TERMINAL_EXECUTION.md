# Terminal Execution — Competitive Analysis
> Maintained by `research-feature-analyst`. Last updated: 2026-05-11.
> Sources verified: `src/core/task/tools/handlers/ExecuteCommandToolHandler.ts`, `src/integrations/terminal/CommandExecutor.ts`, `src/integrations/terminal/CommandOrchestrator.ts`, `src/integrations/terminal/constants.ts`, `src/integrations/terminal/types.ts`, `src/integrations/terminal/standalone/StandaloneTerminalProcess.ts`, `src/integrations/terminal/standalone/StandaloneTerminalManager.ts`, `src/hosts/vscode/terminal/VscodeTerminalProcess.ts`, `src/hosts/vscode/terminal/VscodeTerminalManager.ts`, `src/core/task/tools/utils/ModelContentProcessor.ts`, `src/core/controller/ui/setTerminalExecutionMode.ts`, `src/utils/shell.ts`, `cli/src/acp/AcpTerminalManager.ts`.

## 1. Overview / نظرة عامة

Terminal Execution is the surface through which the agent runs shell commands and streams their output back into the conversation. GenCoder routes `execute_command` tool calls through a unified `CommandExecutor` that delegates to one of three backends depending on host environment and user setting: (a) VS Code's shell-integration API (default, when running inside VS Code), (b) a child-process backend (CLI and "Background Exec" mode), or (c) ACP-delegated terminals (when running under an Agent-Client-Protocol editor). The same orchestration logic handles output buffering, "Proceed While Running" detachment, large-output spill-to-file, timeouts, and cancellation across all three backends.

سطح تنفيذ الأوامر هو الواجهة التي يستخدمها الوكيل لتشغيل أوامر الـ shell وقراءة مخرجاتها. GenCoder يوجّه استدعاءات أداة `execute_command` عبر مُنفّذ موحّد يفوّض إلى أحد ثلاثة محرّكات: واجهة Shell Integration الخاصة بـ VS Code، أو عملية فرعية (CLI أو وضع التنفيذ في الخلفية)، أو محرّك ACP. نفس منطق التنسيق يتعامل مع التخزين المؤقت للمخرجات، زر "Proceed While Running"، إفلات المخرجات الكبيرة إلى ملف، حدود الوقت، والإلغاء.

## 2. Current State in GenCoder / الوضع الحالي

**Tool entry-point (`ExecuteCommandToolHandler`, `src/core/task/tools/handlers/ExecuteCommandToolHandler.ts:58-335`).**
The handler is registered as `ClineDefaultTool.BASH` (`L59`). It expects two required params, `command` and `requires_approval`, and an optional `timeout` (`L88-112`). Missing params increment `consecutiveMistakeCount` and return an error (`L100-112`). Auto-approve resolution returns a `[safe, all]` tuple (`L196-199`); a command marked safe by the model + `executeSafeCommands` toggle on runs without prompting; risky commands require both safe and all-commands toggles or YOLO/auto-approve-all (cross-ref `PERMISSIONS_AND_AUTOAPPROVE.md`).

**Timeout policy (`L18-56`).** Two defaults are hard-coded: `DEFAULT_COMMAND_TIMEOUT_SECONDS = 30` and `LONG_RUNNING_COMMAND_TIMEOUT_SECONDS = 300`. Function `isLikelyLongRunningCommand` (`L36-39`) tests the command against eleven regex patterns (`L22-34`): npm/pnpm/yarn/bun install|ci|build|test, pip/poetry install, cargo/go/mvn/gradle build|test, make/cmake, pytest/jest/vitest/mocha, docker build, torchrun/accelerate, ffmpeg, python train|finetune. `resolveCommandTimeoutSeconds` (`L41-56`) parses an explicit `timeout` param if provided; otherwise returns the long-running default for matches, normal default otherwise. **Timeouts are only applied when `yoloModeToggled === true` OR `vscodeTerminalExecutionMode === "backgroundExec"`** (`L117-121`). In default VS Code terminal mode, **no timeout is enforced** — the command can run indefinitely until the user clicks "Proceed While Running" or cancels.

**Model-specific input fix (`L123-126`).** When the active model id includes `"gemini"`, the command string is passed through `applyModelContentFixes` (`src/core/task/tools/utils/ModelContentProcessor.ts:19-35`). That function un-escapes HTML entities (`&lt; &gt; &amp;`) and strips invalid control characters when the model is not Claude (`L20-22`). Gemini occasionally emits HTML-escaped shell metacharacters inside command strings; this fix is what makes `grep "foo<bar>"` actually execute.

**Multi-root workspace routing (`L128-159`).** When `config.isMultiRootEnabled` is true and the command starts with `@<workspace-name>:<command>` (regex `^@(\w+):(.+)$`, `L138`), the workspace name is resolved via `WorkspacePathAdapter` (`L146-153`) to its absolute root, and the command is rewritten as `cd "<workspace-root>" && <actual-command>` before execution (`L306-311`). Telemetry captures whether the hint was used vs. fallback-to-primary (`L211-221`). The CLAUDE.md tribal note implied `@backend:npm install` syntax — **verified present in source**.

**Permission gate (`L162-181`).** Every command (the post-hint `actualCommand`) is run through `commandPermissionController.validateCommand`. If denied (env-var `CLINE_COMMAND_PERMISSIONS` allow/deny list), a `command_permission_denied` say is emitted and the tool returns a permission-denied error.

**Clineignore gate (`L184-190`).** Commands that touch ignored paths (e.g., `cat .env`) are blocked with `clineIgnoreError`.

**File-cache invalidation (`L319-327`).** After **any** successful command, `taskState.fileReadCache.clear()` is called because shell commands can mutate files in ways the agent cannot predict (sed, npm install, git checkout, mv).

**Unified executor (`CommandExecutor`, `src/integrations/terminal/CommandExecutor.ts:36-268`).** This class wraps both backends behind a single `execute(command, timeoutSeconds, options)` signature.
- Backend selection (`L98-112`): if `options.useBackgroundExecution` or `terminalExecutionMode === "backgroundExec"`, use the `StandaloneTerminalManager`; otherwise use the host's configured manager (VS Code in the extension, ACP in ACP mode).
- Strips a leading `cd <cwd> && ` from the command (`L103-107`) before dispatch — this is the inverse of the prepend done by `ExecuteCommandToolHandler` when there's no workspace hint, ensuring redundant `cd` prefixes don't pollute display.
- Tracks the currently-executing foreground process for cancellation (`L46-49, 119-126`).
- Tracks repeated shell-integration warnings: 3+ warnings within an hour triggers the "switch to Background Exec" suggestion (`L241-267`).
- `cancelBackgroundCommand` (`L169-215`) cancels both detached background commands and the live foreground process, sets `wasCancelledExternally`, and **modifies the prior `command_output` message text** rather than emitting a new say (`L196-211`) to avoid clobbering pending asks.

**Orchestrator (`orchestrateCommandExecution`, `src/integrations/terminal/CommandOrchestrator.ts:52-669`).** Shared between both backends.
- **Output chunking (`L120-298`):** lines are buffered until `CHUNK_LINE_COUNT=20`, `CHUNK_BYTE_SIZE=2048`, or `CHUNK_DEBOUNCE_MS=100` (`constants.ts:25-32`). Each flush is presented as an `ask("command_output", chunk)`; the user's response determines next action.
- **"Proceed While Running" (`L203-255`):** when the user clicks the proceed button, response `"yesButtonClicked"` causes the orchestrator to either (a) hand the still-running process to background tracking (standalone only, `onProceedWhileRunning` callback, `L218-253`) which writes new lines to a temp log file, or (b) just call `process.continue()` and stream remaining output via `say` (VS Code mode, `L286-290`).
- **Cancel-via-UI (`L256-268`):** response `"noButtonClicked"` with `text === COMMAND_CANCEL_TOKEN` sets `didCancelViaUi`, emits a final `Command cancelled` say, and continues the process.
- **Large-output spill to file (`L301-365, 383-398`):** when `outputLines.length >= MAX_LINES_BEFORE_FILE=1000` OR `totalOutputBytes >= MAX_BYTES_BEFORE_FILE=512KB` (`constants.ts:46-49`), the orchestrator switches to file-based logging: opens a write stream via `ClineTempManager.createTempFilePath("large-output")`, dumps existing lines, then writes each subsequent line to disk while keeping only the first/last `SUMMARY_LINES_TO_KEEP=100` lines (`constants.ts:52`) in memory for the eventual summary. The agent sees a truncated `... (N lines written to <path>) ...` blob (`L584-589`).
- **Stuck-buffer / hang telemetry (`L160-163, 436-441`):** `BUFFER_STUCK_TIMEOUT_MS=6000` and `COMPLETION_TIMEOUT_MS=6000` (`constants.ts:35-38`) trigger `telemetryService.captureTerminalHang(TerminalHangStage.BUFFER_STUCK | WAITING_FOR_COMPLETION, terminalType)`.
- **Timeout → background-tracking promotion (`L474-558`):** if a timeout fires and the standalone backend is in use (i.e., `onProceedWhileRunning` is wired), the orchestrator promotes the command to background-tracked instead of killing it. In VS Code mode there is no `onProceedWhileRunning` and the orchestrator returns a `"timed out"` result while the command keeps running (`L535-548`).
- **Result formatting (`L634-668`):** the final message includes status ("executed successfully (exit code 0)" / "failed with exit code N" / "terminated by signal X" / "still running"), the truncated output, and the log-file path if spill occurred.

**VS Code backend (`VscodeTerminalProcess`, `src/hosts/vscode/terminal/VscodeTerminalProcess.ts:32-340`).**
- Uses `terminal.shellIntegration.executeCommand(command)` (`L62`) which returns an async-iterable output stream. Parses `OSC 633 ; D ; <exitCode>` sequences (`L72-79`) for the exit code — this is the **VS Code custom shell integration protocol**, documented at `code.visualstudio.com/docs/terminal/shell-integration`.
- First-chunk processing (`L82-143`): strips VS Code escape sequences (regex `\x1b\]633;.[^\x07]*\x07`), removes duplicate-first-char artifacts (carefully whitelisting `[`, `{`, `"`, `'`, `<`, `(` to preserve JSON/syntax), removes prompt prefixes (`%$#>`), and strips ANSI via `stripAnsi`.
- **Ctrl+C detection (`L149-155`):** if output contains `^C` or ``, marks the process as cooled.
- **Command-echo suppression (`L159-171`):** the first chunk often echoes the command back; the loop discards lines that are substrings of the command. Side-effect comment at `L160`: *"this means that 'echo' commands won't work"*.
- **Hot-state markers (`L173-186`):** when output contains compiling markers (`compiling`, `building`, `bundling`, `transpiling`, `generating`, `starting`, constants `COMPILING_MARKERS`) without nullifiers (`compiled`, `success`, `done`, etc., `COMPILING_NULLIFIERS`), the hot-cooldown is extended from `PROCESS_HOT_TIMEOUT_NORMAL=2000` to `PROCESS_HOT_TIMEOUT_COMPILING=15000` ms (`constants.ts:14-18, 81-101`). `isHot` stalls subsequent API requests.
- **Fallback when shell integration absent (`L240-265`):** falls back to `terminal.sendText(command, true)`, waits 3 seconds, then captures via clipboard-based `getLatestTerminalOutput()`. Emits `no_shell_integration` to trigger the UI warning (`CommandOrchestrator.ts:466-472`). **No exit code is available in this path.**

**Standalone/child-process backend (`StandaloneTerminalProcess`, `src/integrations/terminal/standalone/StandaloneTerminalProcess.ts:39-360`).**
- Spawns via Node's `child_process.spawn` (`L116-124`) with `stdio: ["ignore", "pipe", "pipe"]` — **STDIN is intentionally closed** to prevent interactive prompts from hanging the agent (`L99` comment: *"Disable STDIN to prevent interactivity"*).
- **Anti-pager environment (`L100-108`):** injects `PAGER=cat`, `EDITOR=cat`, `GIT_PAGER=cat`, `SYSTEMD_PAGER=""`, `MANPAGER=cat`, plus `TERM=xterm-256color` for ANSI compatibility. This is the primary defense against `git log` / `man` / `less` hanging the spawned shell.
- **Shell selection (`L82-84, 310-315, 323-332`):** `terminal._shellPath || process.env.SHELL || /bin/bash` on POSIX; `process.env.COMSPEC || "cmd.exe"` on Windows. Shell-args dispatch: `cmd.exe /c <cmd>`, `powershell -Command <cmd>` or `pwsh -Command <cmd>`, otherwise `sh -l -c <cmd>` (login shell).
- **cmd.exe quoting fix (`L111-116`):** when shell name contains `"cmd"`, spawn with `shell: true` to avoid Node's double-quote over-escaping bug.
- **Process group (`L118-124`):** non-Windows spawns with `detached: true` so the entire process group can be killed via `terminateProcessTree` (`L342-359`), which uses `tree-kill` for cross-platform tree termination with a SIGTERM-then-SIGKILL fallback after 2 seconds (`L355-358`).
- Output is collected from stdout **and** stderr (`L130-147`) and emitted as `line` events — **stderr is merged into stdout in the agent's view**. Buffered into the same `fullOutput` string capped at `MAX_FULL_OUTPUT_SIZE=1MB` (`constants.ts:55`); when capped, only the latter 512KB is kept and `lastRetrievedIndex` is reset (`L208-214`).
- ANSI is stripped via `removeLastLineArtifacts` only at end-of-output for prompt cleanup (`L297-304`) — **mid-stream ANSI is NOT stripped in the standalone path** (it's stripped in the VS Code path at `L115, 145`). ⚠ Could be a divergence in CLI output quality.

**Background-command registry (`StandaloneTerminalManager`, `src/integrations/terminal/standalone/StandaloneTerminalManager.ts:88-94, 102-128`).** When a command is promoted to background tracking, it's recorded in `backgroundCommands: Map<string, BackgroundCommand>`, a `fs.WriteStream` is opened to the log file, and a `BACKGROUND_COMMAND_TIMEOUT_MS=10 * 60 * 1000` (10-minute) safety timeout is armed (`constants.ts:77`). On `Task.disposeAll` the registry kills every background process and closes every stream (`L239-260`).

**Terminal-execution-mode setting (`src/core/controller/ui/setTerminalExecutionMode.ts:1-24`).** A simple controller endpoint flips `vscodeTerminalExecutionMode` between `"vscodeTerminal"` and `"backgroundExec"` and re-posts state. `Task` reads this at `src/core/task/index.ts:287, 322`. Background-Exec mode unlocks: (a) timeouts on all commands (not just yolo), (b) hidden terminals (no UI clutter), (c) automatic detach via background tracking on timeout.

**ACP backend (`cli/src/acp/AcpTerminalManager.ts:1-80`).** When GenCoder runs as an Agent under an ACP host (e.g., Zed), terminal lifecycle is delegated to the host editor via `acp.TerminalHandle`. Output limits are exposed as `outputByteLimit: bigint` in the ACP request (`L52-53`) but the agent passes through whatever the editor returns. ⚠ unverified: how stderr separation works in the ACP path.

**Constants table summary (`src/integrations/terminal/constants.ts:1-112`).**
| Constant | Value | Purpose |
|---|---|---|
| `PROCESS_HOT_TIMEOUT_NORMAL` | 2000 ms | Cooldown after last output before unblocking API |
| `PROCESS_HOT_TIMEOUT_COMPILING` | 15000 ms | Extended cooldown for builds |
| `CHUNK_LINE_COUNT` | 20 | Lines before flushing buffer to UI |
| `CHUNK_BYTE_SIZE` | 2048 | Bytes before flushing buffer to UI |
| `CHUNK_DEBOUNCE_MS` | 100 | Debounce time |
| `BUFFER_STUCK_TIMEOUT_MS` | 6000 | Hang telemetry trigger |
| `MAX_LINES_BEFORE_FILE` | 1000 | Switch to file-spill |
| `MAX_BYTES_BEFORE_FILE` | 524288 | Switch to file-spill |
| `SUMMARY_LINES_TO_KEEP` | 100 | First/last lines kept after spill |
| `MAX_FULL_OUTPUT_SIZE` | 1048576 | In-memory cap; truncates to latter 512KB |
| `MAX_UNRETRIEVED_LINES` | 500 | Cap returned to agent on each pull |
| `DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT` | 500 | Final-result truncation cap |
| `BACKGROUND_COMMAND_TIMEOUT_MS` | 600000 | Zombie-process safety net |
| `DEFAULT_COMMAND_TIMEOUT_SECONDS` | 30 | yolo/backgroundExec default |
| `LONG_RUNNING_COMMAND_TIMEOUT_SECONDS` | 300 | yolo/backgroundExec long-cmd default |

## 3. Advantages / المميزات الحالية

1. **Real VS Code shell integration with parsed OSC 633 markers (`VscodeTerminalProcess.ts:62-79`).** Exit codes are reliably captured when the user's shell supports v1.93+ shell-integration. Cursor's terminal shows the same output as the agent — there is no hidden pseudo-terminal, so what the user sees is what the agent sees.
2. **Live streaming with "Proceed While Running" (`CommandOrchestrator.ts:150-291`).** The agent doesn't block on long commands. The buffer-and-ask pattern lets the user inject feedback or detach mid-run; standalone mode can hand the process to background tracking so the agent gets a result and the command keeps running with output streamed to a log file.
3. **Compilation-aware hot state (`constants.ts:81-101`, `VscodeTerminalProcess.ts:179-186`).** Markers like "compiling"/"building" extend the cooldown from 2s to 15s, preventing the agent from firing premature API calls while a dev server is rebuilding.
4. **Cross-platform shell awareness (`StandaloneTerminalProcess.ts:310-332`).** Switches between `cmd.exe /c`, `powershell -Command`, and `sh -l -c` based on shell path. The `shell: true` workaround for `cmd.exe` double-quote escaping (`L111-116`) is non-obvious code that fixes a real Node bug.
5. **Anti-hang environment (`StandaloneTerminalProcess.ts:99-108`).** Closed stdin + pager-disabling env vars (`PAGER`, `GIT_PAGER`, `MANPAGER`, `EDITOR`, `SYSTEMD_PAGER`) defuse the most common ways commands hang in non-interactive shells.
6. **Process-tree termination (`L342-359` + `terminateProcessTree`).** SIGTERM-then-SIGKILL-after-2s with `tree-kill` ensures that `npm run dev` doesn't leave orphaned node processes on cancel.
7. **Spill-to-file on large output (`CommandOrchestrator.ts:301-365`).** 512KB / 1000-line threshold protects both memory and the model's context window. The agent sees a summary; the user can read the full log.
8. **Multi-workspace `@<name>:command` routing (`ExecuteCommandToolHandler.ts:128-159`).** Telemetry-tracked, multi-root-aware (verified — CLAUDE.md tribal-knowledge note was correct).
9. **Pre-execution permission gate (`ExecuteCommandToolHandler.ts:162-181`).** Environment-variable allow/deny list runs before approval — even YOLO-approved commands can be hard-blocked by ops policy.
10. **File-cache invalidation after every command (`L319-327`).** Prevents stale reads after `sed`, `mv`, `npm install`, etc.
11. **Cross-host portability via `ITerminalManager` (`types.ts:43-80`).** Same orchestrator code runs against VS Code shell integration, child_process, or ACP TerminalHandle — large code path is shared.
12. **Cancellation that doesn't break pending asks (`CommandExecutor.ts:192-211`).** Modifying the prior `command_output` message instead of pushing a new say avoids "Current ask promise was ignored" errors — non-obvious UX detail.
13. **Gemini HTML-entity input fix for commands (`ExecuteCommandToolHandler.ts:123-126`).** Prevents Gemini from sending `grep "foo&lt;bar&gt;"` and having it fail.

## 4. Disadvantages & Gaps / العيوب والثغرات

1. **No working-directory tracking across commands.** After `cd subdir && npm install`, the agent has no record that subsequent commands implicitly assume `subdir`. The `StandaloneTerminalManager` does change `_cwd` when reusing a terminal (`L156-161`), but the agent's tool-input layer doesn't read this — every fresh `execute_command` resolves against `config.cwd` (`ExecuteCommandToolHandler.ts:129, 308`). Frequent agent failure mode: agent runs `cd backend`, then runs `pytest`, gets "no tests found" because the second command ran from project root.
2. **Bytes-based output truncation, not token-aware.** `MAX_BYTES_BEFORE_FILE=512KB` and `DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT=500` are byte/line caps applied **before** the agent's context-budget computation. A 400KB JSON dump fits under the file-spill threshold but explodes the model's token budget. Cross-ref `CONTEXT_MANAGEMENT.md` P0#1.
3. **No stderr separation (`StandaloneTerminalProcess.ts:130-147`).** stdout and stderr are merged into the same `line` event stream. The agent cannot distinguish "diagnostic noise on stderr while build succeeds" from "build failed with errors on stderr". Test runners like jest print progress to stderr and results to stdout — currently indistinguishable.
4. **Shell-integration fallback is fragile (`VscodeTerminalProcess.ts:240-265`).** When devcontainers, WSL, or custom shells lack shell-integration, the fallback path waits 3 seconds, scrapes the visible terminal buffer via clipboard, and never has an exit code. Many users silently get degraded output capture and don't know why.
5. **Interactive commands hang or fail silently.** `sudo`, `ssh` with password prompts, `git push` with credential prompt, `npm login`, `gh auth login` — stdin is closed (`StandaloneTerminalProcess.ts:99`) so the program either errors with "tty required" or hangs waiting forever. The pre-execution layer doesn't pattern-match these.
6. **Default-mode commands have no timeout (`ExecuteCommandToolHandler.ts:117-121`).** Outside YOLO and Background-Exec, no timeout is enforced. A hung command sits there until the user clicks cancel. Users discover this only after losing a session to a stuck `git pull` over a flaky VPN.
7. **`echo` commands don't work in VS Code mode (`VscodeTerminalProcess.ts:160 comment`).** The command-echo-suppression logic that strips command-text from the first chunk also strips the actual `echo "foo"` output. The codebase comment acknowledges this but there's no fix.
8. **Mid-stream ANSI not stripped in standalone path.** The VS Code path calls `stripAnsi(data)` for each chunk (`L115, 145`); the standalone path only cleans the final line's prompt artifacts (`StandaloneTerminalProcess.ts:297-304`). CLI users with colored compiler output get raw `\x1b[31m` codes in the agent's context. ⚠ Mid-stream stripping may exist further upstream; spot-verified absent from `StandaloneTerminalProcess`.
9. **Concurrent commands per terminal: not supported.** `StandaloneTerminalManager.getOrCreateTerminal` reuses a terminal only if `!t.busy` (`L139-150`). A truly concurrent agent that wants to launch test + lint + typecheck in parallel needs three terminals, but the orchestrator's "Proceed While Running" pattern is built around a single foreground process.
10. **Environment-variable leakage risk.** Spawning inherits `process.env` (`StandaloneTerminalProcess.ts:101`). If the user has `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, or `DEEPSEEK_AUTH_TOKEN` in their shell, every spawned process inherits them. If the command happens to print env (`env`, `printenv`, `set`, malicious npm postinstall), secrets land in the agent's context **and in the file-spill log file**.
11. **Windows PowerShell quirks not encoded.** The CLAUDE.md in this repo documents PowerShell-specific issues (no `&&` chain operator, here-string column-0 rule, `2>&1` ErrorRecord wrapping, etc.). The handler doesn't pattern-match these — a Gemini-style fix would translate `&&` to `; if ($?) { ... }` for PowerShell. Currently the agent must learn this empirically every session.
12. **No structured-output adapters.** Tests, linters, type-checkers all emit machine-readable formats (`--json`, `--junit-xml`, SARIF). The orchestrator treats everything as raw text. The agent re-parses jest's human output every run instead of getting structured pass/fail counts.
13. **Hidden temp log files are not auto-cleaned per task.** `ClineTempManager.createTempFilePath("large-output")` (`L336`) writes to OS temp. Verified that `disposeBackgroundCommands` clears streams (`L240-260`), but ⚠ unverified whether old spill files from completed (non-background) tasks are cleaned up.
14. **CLI/ACP loses the OSC 633 exit-code parser.** Standalone process gets exit codes from Node's `close` event (`L150-154`) which is reliable. ACP path depends entirely on the host editor's reporting; ⚠ unverified what happens when ACP host returns no exit code.
15. **No "command may need user input" detection.** No heuristic for commands ending in `sudo`, containing `--interactive`, ending without `< /dev/null`, etc.
16. **Buffer-stuck telemetry but no user remediation.** When `BUFFER_STUCK_TIMEOUT_MS=6000` fires, telemetry is captured (`CommandOrchestrator.ts:160-163`) but the user sees nothing — no toast, no "this command seems stuck" hint.
17. **`tree-kill` 2-second SIGKILL fallback may be too tight for graceful shutdown.** Dev servers (`next dev`, `vite`) that need to flush state on SIGTERM get SIGKILLed after 2 seconds; ports may remain bound for the next run.

## 5. Competitor Landscape / المقارنة مع المنافسين

| Competitor | Their approach | Better / Worse |
|---|---|---|
| **Cline upstream** | Same code path — `CommandOrchestrator`, `VscodeTerminalProcess`, `StandaloneTerminalProcess` are forked verbatim. ⚠ Last upstream sync verified by file paths matching. | parity (this is shared infrastructure) |
| **Cursor** | Built-in terminal panel + AI side-by-side. Cursor Composer's agent runs commands in the same visible terminal the user sees, similar to GenCoder's VS Code mode. ⚠ unverified mid-2026 behavior — WebSearch recommended for refresh. | likely parity for visible execution; Cursor's auto-run is more aggressive by default |
| **Windsurf (Codeium)** | Cascade agent has terminal-execution capability; claims live streaming with structured-output parsing for npm/cargo. ⚠ unverified — WebSearch. | unknown; likely better at structured-output if claims hold |
| **Continue.dev** | `@terminal` context provider reads terminal history into the prompt, but Continue is primarily chat-driven, not agentic. Agent autonomy is limited; rarely executes commands without user click. | weaker for agents; safer-by-default |
| **Aider** | CLI-native — owns the terminal already. `/run <cmd>` and `/test` subcommands. Exits with the command's exit code; output capture is mature (direct stdout/stderr piping). No "Proceed While Running" needed because user controls the REPL. | better at low-level reliability and exit-code fidelity; worse at agentic autonomy |
| **GitHub Copilot CLI (`gh copilot suggest`, `gh copilot explain`)** | Suggests commands; user must press Enter to execute. Does not autonomously run. ⚠ behavior may have evolved 2025-2026 — WebSearch. | safer by design; much narrower scope |
| **Roo Code / Kilo Code** | Cline-derived; ⚠ unverified per-command allowlist (referenced in `PERMISSIONS_AND_AUTOAPPROVE.md` as a probable P1 differentiator). | likely better permission model if confirmed |
| **Augment** | Enterprise pitch includes "sandboxed execution" for agentic commands — ⚠ unverified specifics, WebSearch needed. | potentially better isolation; worse latency |
| **Zed AI / Zed Assistant** | Native ACP host; GenCoder running as ACP agent delegates terminal to Zed itself (`cli/src/acp/AcpTerminalManager.ts`). Zed's terminal is fast and tightly integrated. | parity-via-delegation; Zed's terminal is arguably faster than VS Code's |
| **Devin (Cognition)** | Long-running cloud sandbox with persistent shell session across "task days." Working-directory tracking, env state, and process state all persist. | dramatically better for multi-step agent workflows; not local |

## 6. Recommended Additions / مميزات مقترحة للإضافة

### P0

1. **Working-directory tracking between commands.** Parse `cd <path>` (and `pushd`/`popd`) from each executed command, update an in-memory `currentCwd` for that conversation, and prepend `cd "<currentCwd>" && ` to subsequent relative commands. Closes a high-frequency failure mode (agent runs `cd backend && cd src` then `ls`, currently gets project-root listing). Implementation in `ExecuteCommandToolHandler.ts` between L88 and L162 — read prior commands from `taskState`, maintain a `cwd-stack` per terminal.
2. **Token-aware output truncation.** Replace `DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT=500` and `MAX_BYTES_BEFORE_FILE=512KB` with tokenizer-aware caps that respect per-provider context budgets. The Context-Window-Manager (cross-ref `CONTEXT_MANAGEMENT.md` P0#1) should be the source of truth; the terminal-output processor should ask it "how many tokens can I emit?" before truncating. Today's bytes-cap is provider-blind.
3. **Interactive-command detection and either auto-feed flags or surface a prompt.** Pattern-match known interactive commands (`sudo`, `ssh`, `gh auth login`, `git push` without credential helper, `npm login`, `passwd`) and either (a) auto-append `--no-input`/`--yes`/`--non-interactive` flags where supported, or (b) emit a UI ask before execution saying "this command may need stdin — proceed in your own terminal?". Defuses the most common silent-hang category.
4. **Detect-and-warn when shell integration is unavailable.** Currently the fallback path runs silently (`VscodeTerminalProcess.ts:240-265`). Surface a once-per-session toast: "Shell integration not available in this terminal — output capture will be limited. See <docs link>." Also include a "switch to Background Exec" CTA (the orchestrator already tracks 3+ warnings for this; expose it earlier).
5. **Stderr-stdout separation (cross-cutting).** Emit `lineStderr` events from both backends in addition to `line`; surface stderr as a distinct rendered block in the agent's context (e.g., labelled `<stderr>...</stderr>`). The agent can then learn that stderr output during a successful build is just warnings.
6. **Secret-redaction layer on output capture.** Before pushing output to the agent's context or to the spill file, run a regex pass for known token patterns (`sk-`, `ghp_`, `xoxb-`, AWS access-key format, JWT regex). Redact-by-default with an option for the user to opt out per-workspace. Closes a real data-exfiltration risk for hosted models.

### P1

1. **Background-process registry surfaced in UI.** The internal registry exists (`StandaloneTerminalManager.ts:88-94`); surface it as a status-bar widget showing N running background commands with a "Kill all / Kill one" menu. Auto-kill on task end is already implemented (`disposeBackgroundCommands`); make the dispose visible.
2. **Structured-output adapters.** Built-in detection: if command matches `pytest|jest|vitest|mocha`, append `--json` (or read `--reporter json` for jest); parse the JSON tail of stdout into a structured tool result (pass/fail counts, failure messages). Same pattern for `eslint --format json`, `tsc --noEmit -p` (parse `error TS####`), `cargo test --message-format json`. Saves enormous context vs raw text parsing.
3. **Multi-workspace `@<name>:command` docs + autocomplete.** The syntax works (`ExecuteCommandToolHandler.ts:138-157`) but isn't surfaced — webview should autocomplete workspace names when the user types `@` in chat, and the system prompt should teach the agent about it (cross-ref `SYSTEM_PROMPT.md`). Today this is power-user-only.
4. **Terminal-output history accessible after context-pruning.** When the orchestrator spills to a log file (`CommandOrchestrator.ts:301-365`), keep the log path attached to the message metadata and offer a "Re-read command N output" tool the agent can invoke even after the original output was pruned from context.
5. **Windows PowerShell quirk translator.** When `getShell()` returns `pwsh.exe`/`powershell.exe`, apply translations: `&&` → `; if ($?) {`, `||` → `; if (!$?) {`, `$VAR` → `$env:VAR` for known env access patterns. Inverse of the Gemini HTML-fix already in place.
6. **Per-command timeout override syntax in chat.** Today the model can pass `timeout` as a tool param (`ExecuteCommandToolHandler.ts:91`). Expose this in chat: `/timeout 600 npm run e2e:full` overrides the default for the next command.
7. **Buffer-stuck remediation to the user.** When telemetry-side hang detection fires (`CommandOrchestrator.ts:160-163`), also raise a UI hint with "Cancel / Proceed While Running" reminder. Today only telemetry is captured.
8. **CLI mid-stream ANSI stripping.** Apply `stripAnsi` to each chunk in `StandaloneTerminalProcess.handleOutput` (`L191`) so CLI users get clean output (currently only end-of-line is cleaned).

### P2

1. **Sandboxed-execution mode (devcontainer / Docker).** When `terminalExecutionMode === "sandbox"`, route commands through `docker exec` against an ephemeral image. Matches Augment's pitch and Devin's persistent-VM model. Requires significant new infrastructure but is the eventual-direction for safe autonomous agents.
2. **Concurrent multi-command execution.** Lift the single-foreground-process assumption in the orchestrator. Allow `parallel: true` in the tool call to run e.g. `npm test` + `npm run lint` + `tsc --noEmit` simultaneously; aggregate results.
3. **Snapshot/restore filesystem between commands (git-backed).** Auto-commit before `execute_command`, expose `/undo last command` to roll back filesystem changes (file-cache invalidation already happens per command — extend to a git-backed snapshot). Composes with `CHECKPOINTS` mechanisms in Cline.
4. **Per-task secret-store proxy.** Spawn commands with a stripped `process.env` minus known secrets; if a command needs an AWS key, surface an ask asking the user to inject just that one variable for just that one command. Hard version of P0#6.
5. **Persistent shell session per terminal.** Today every command starts a fresh login shell (`sh -l -c <cmd>`, `StandaloneTerminalProcess.ts:331`), losing exports, aliases, `nvm use` state, etc. A persistent `node-pty` session with prompt-detection would preserve shell state across commands, matching what Aider does and what users expect.
6. **VS Code terminal profile picker per command.** The infrastructure exists (`setDefaultTerminalProfile`, `L290-301`) but the agent can't specify "run this in PowerShell, that in WSL bash". Expose a `shell` param in the tool input.

## 7. Open Questions / أسئلة مفتوحة

1. Should the CLI emulate VS Code's shell integration richness (via `node-pty` + an OSC-633 polyfill on the shell side) or accept the gap and document it? `node-pty` adds a native dependency to the CLI bundle.
2. Should environment variables exported by `.env` files be auto-loaded into the spawned command, and if so, should they be redacted from output? Currently they're not loaded at all — the agent has to `source .env && ...` manually.
3. When `BACKGROUND_COMMAND_TIMEOUT_MS=10min` fires on a long-running training script, is killing the process the right default, or should we ask the user? Cross-ref to `CONTEXT_MANAGEMENT.md` for "task-can-pause" patterns.
4. How does long-running command output interact with the DeepSeek-Web provider's effective context budget? Each output line consumes characters in the browser's chat box (`BROWSER_BRIDGE.md`). Spilling 512KB to a log file then summarizing 100 first + 100 last lines is still ~10KB of summary — is that bounded enough for a 32K-context DeepSeek session?
5. For ACP-delegated terminals, does the host editor honor `BACKGROUND_COMMAND_TIMEOUT_MS`, or do we get zombie processes if the host doesn't clean up?
6. Is the "command-echo suppression" logic (`VscodeTerminalProcess.ts:159-171`) safe enough to enable `echo` commands? Could the suppression instead check for an OSC 633 `C` boundary and only suppress before it?
7. Should `requires_approval` parameter on `execute_command` be inferred (via a deny-list of dangerous patterns: `rm -rf`, `:(){:|:&};:`, `dd if=`, `mkfs`) rather than left entirely to the LLM? Today the model decides; a malicious-prompt-injection could trick the model into setting `requires_approval=false` for `rm -rf /`.

## 8. Change Log

- **2026-05-11** — Initial creation. Verified end-to-end: tool handler → CommandExecutor → CommandOrchestrator → both backends + ACP. Confirmed `@<workspace>:command` syntax from `ExecuteCommandToolHandler.ts:138`. Confirmed Gemini HTML-fix at `L123-126`. Confirmed timeouts are gated on yolo/backgroundExec only (`L117-121`). Documented all 14 terminal constants and the OSC 633 protocol details (`VscodeTerminalProcess.ts:72-95`).
