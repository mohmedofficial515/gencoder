---
description: Launch the modular-architect agent to extract a feature of GenCoder into its own self-contained module — plans, asks for approval, extracts, tests, builds, pushes to GitHub, generates a manual test plan, and reports a summary. Approval-gated at every step.
argument-hint: "[module name | 'plan' | 'continue' | 'status' | 'roadmap']  (default: plan)"
allowed-tools: Task, Read, Glob, Bash, AskUserQuestion
---

You are dispatching the **modular-architect** agent. It owns the full modularization loop (discovery → plan → approval → extract → verify → commit → push → manual test plan → summary). Your job here is to brief it correctly and hand off — do NOT do the work yourself.

## User's argument

`$ARGUMENTS`

Interpret it as follows:

- **empty** or `plan` → tell the agent: "Discovery + planning mode. Read the codebase, propose 2-3 candidate modules to extract next (ordered by independence and fork-distinctive value), and present them to the user with reasoning. Do NOT start extracting until the user picks one. Update `.planning/modular/ROADMAP.md` with the candidates."

- `continue` → tell the agent: "Resume the in-progress modularization cycle. Read `.planning/modular/ROADMAP.md` to find the 🟡 in-progress module. Read its `PLAN.md` and `VERIFY_LOG.md` to determine which phase you're at. Resume from there, restating to the user what step is next and asking for approval if a gate is pending."

- `status` → tell the agent: "Read `.planning/modular/ROADMAP.md` and report: which modules are complete (✅), which is in progress (🟡), which are queued (⬜). For the in-progress one, summarize its current phase. No work — just a status report. Under 300 words."

- `roadmap` → tell the agent: "Generate or refresh `.planning/modular/ROADMAP.md`. Map the full feature surface of GenCoder (use the `.gencoder/research/` feature coverage map as a starting list — `API_PROVIDERS`, `BROWSER_BRIDGE`, `DEEPSEEK_INTEGRATION`, `SYSTEM_PROMPT`, `SLASH_COMMANDS`, `MCP_INTEGRATION`, `WEBVIEW_UI`, `CLI_ARCHITECTURE`, `TESTING_SETUP`, etc.) and rank each by extraction readiness (independence × value × risk). Output the roadmap and present the top 3 candidates for the next cycle. Do NOT start any extraction."

- **anything else** → treat it as a module/feature name. Map it to a feature area (e.g. "deepseek" → DeepSeek provider + PoW solver + browser bridge; "browser" → `extension/` Chrome bridge). If ambiguous, list 2-3 candidates and ask the user. If clear: dispatch the agent in **full-cycle mode** for that module.

## Pre-flight checks (do these before dispatching the agent)

1. **Git state**: run `git -C c:/gencoder status --short` and `git -C c:/gencoder branch --show-current`. If there are uncommitted changes that aren't `.planning/` or `.claude/`, warn the user and ask: "Commit/stash first, or include them in the modular cycle?" via `AskUserQuestion`.
2. **Roadmap presence**: check if `.planning/modular/ROADMAP.md` exists. If not, the first dispatch should be in `roadmap` mode regardless of what the user asked — the agent needs a roadmap before extracting. Tell the user this and offer to bootstrap it.
3. **Research presence**: check if `.gencoder/research/INDEX.md` exists and is recent. If the targeted module has no corresponding research doc, suggest the user run `/research <feature>` first so the architect has competitive context. Don't block — just suggest.

## Dispatch

State in 1-2 sentences which mode you've picked and why. Then launch the **modular-architect** agent via the `Task` tool with a self-contained prompt that includes:

1. The current date in ISO form (today's date so the agent stamps artifacts correctly).
2. The interpreted mode (`plan` / `continue` / `status` / `roadmap` / `full-cycle <module>`).
3. If full-cycle: the module name + any scope hints the user provided.
4. A reminder that the agent owns the full loop and MUST gate every irreversible step behind explicit user approval via `AskUserQuestion`.
5. A reminder that it can spawn `module-boundary-analyzer` (read-only mapping) and `module-build-verifier` (build/test runs) — and SHOULD, rather than doing those tasks itself.
6. A reminder that auto mode does NOT override approval gates — even in auto mode, planning/extraction/push/PR-creation each need explicit user confirmation.
7. Git state from your pre-flight check (current branch, dirty/clean), so the agent doesn't re-discover it.

## When the agent returns

Surface its end-of-turn output verbatim — that's the Phase 8 SUMMARY.md or the current-phase status. Don't paraphrase. If the agent ended on an `AskUserQuestion`, that question is already shown to the user; you only need to add a one-line framing if it improves readability.

## Don't

- **Don't do the modularization yourself.** This command exists to keep the work scoped inside one agent's context, so the main thread stays clean across sessions.
- **Don't bypass approval gates.** Even if the user wrote `/modularize deepseek` with auto mode active, the agent still asks before extracting. If the user complains, point them at this command's docs — the gates are a feature, not a bug.
- **Don't run `git push`, `gh pr create`, or `npm run compile` from this command's context.** The agent handles all of those inside its own loop.
- **Don't modify files in `.planning/modular/`.** That's the agent's exclusive workspace.
