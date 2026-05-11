---
description: Launch the design-architect agent for a UI/UX cycle on GenCoder (webview or CLI) — researches competitor tools on the web, audits the current UI, proposes a SPEC, implements after approval. Approval-gated at every step.
argument-hint: "[area name | 'ideas' | 'audit' | 'research' | 'propose' | 'implement' | 'status' | 'roadmap']  (default: roadmap)"
allowed-tools: Task, Read, Glob, Bash, AskUserQuestion
---

You are dispatching the **design-architect** agent. It owns the full design loop (discovery → research → audit → propose → approval → implement → verify). Your job here is to brief it correctly and hand off — do NOT do the design work yourself.

## User's argument

`$ARGUMENTS`

Interpret it as follows:

- **empty** or `roadmap` → tell the agent: "Discovery + roadmap mode. Map the full visible surface of GenCoder (webview-ui areas: chat, settings, onboarding, welcome, mcp, browser, worktrees, history, account, cline-rules, menu; plus cli/). Rank each area by (visibility × competitive-gap × risk). Update `.planning/design/ROADMAP.md` and present the top 3 candidate areas for the next cycle with reasoning. Do NOT start any audit/research/SPEC yet — the user picks first."

- `ideas` → tell the agent: "Ideas-only mode. Run Phase 2 (delegate `design-researcher`) for the area the user names, then present a numbered list of patterns surfaced with provenance. Do NOT generate a full SPEC. The user will reply with the numbers they want to graduate to a real cycle." If no area follows `ideas`, ask via `AskUserQuestion` with the area list.

- `audit <area>` → tell the agent: "Audit-only mode. Dispatch `vscode-ux-auditor` for `<area>` and surface the report. Do NOT start research or write a SPEC. End with a question: 'audit shows X — do you want a full cycle?'"

- `research <area>` → tell the agent: "Research-only mode. Dispatch `design-researcher` for `<area>` and surface the report. Do NOT audit or write a SPEC. End with: 'top 3 patterns surfaced — want to draft a SPEC for any of them?'"

- `propose <area>` → tell the agent: "Proposal mode. Run Phases 1-4 (discovery + research + audit + SPEC synthesis). Present the SPEC to the user via the Phase 5 approval gate. Do NOT implement until approved."

- `implement <area>` → tell the agent: "Implementation mode. Verify `.planning/design/<area>/SPEC.md` exists AND is marked approved. If not, refuse and tell the user to run `/design propose <area>` first. If yes, dispatch `design-implementer` and run Phase 7 verification."

- `status` → tell the agent: "Status report. Read `.planning/design/ROADMAP.md` and report: which areas are complete (✅), which are in progress (🟡), which are queued (⬜). For the in-progress one, summarize phase + last action. Under 300 words. No work — just a status report."

- `continue` → tell the agent: "Resume the in-progress design cycle. Read `.planning/design/ROADMAP.md` to find the 🟡 area. Read its `SPEC.md` and `IMPLEMENT_LOG.md` (if present) to determine which phase you're at. Resume from there, restating to the user what step is next and asking for approval if a gate is pending."

- **anything else** → treat it as an area name. Map it to the closest match in the canonical area list (case-insensitive substring against directories under `webview-ui/src/components/` and `cli/src/components/`). If ambiguous, list the top 3 candidates and ask. If clearly mapped, dispatch the agent in **full-cycle mode** for that area (Phases 1 → 7 with all gates).

## Pre-flight checks (do these before dispatching the agent)

1. **Git state**: run `git -C c:/gencoder status --short` and `git -C c:/gencoder branch --show-current`. If there are uncommitted changes outside `.planning/` or `.claude/`, warn the user and ask via `AskUserQuestion`: "Commit/stash first, or include them in the design cycle?"
2. **Roadmap presence**: check whether `.planning/design/ROADMAP.md` exists. If not and the user did NOT ask for `roadmap` mode, suggest bootstrapping the roadmap first via `/design roadmap`. Don't block — just suggest.
3. **Research presence (when needed)**: for `propose <area>` or full-cycle, suggest the user has already run `/research <area>` (or that area's coverage map entry exists in `.gencoder/research/`) so the architect's research phase can build on prior competitive notes. Don't block.
4. **CLI flag**: if the area name matches a CLI surface (e.g., user typed `cli` or `tui`), pass an explicit hint to the architect: "CLI surface — weight Aider heavily in research; theme integrity becomes terminal-color integrity per `.clinerules/cli.md`."

## Dispatch

State in 1–2 sentences which mode you've picked and why. Then launch the **design-architect** agent via the `Task` tool with a self-contained prompt that includes:

1. The current date in ISO form (today's date) so the agent stamps artifacts correctly.
2. The interpreted mode (`roadmap` / `ideas <area>` / `audit <area>` / `research <area>` / `propose <area>` / `implement <area>` / `status` / `continue` / `full-cycle <area>`).
3. Any area-specific hints the user supplied.
4. Git state from your pre-flight check (current branch, dirty/clean).
5. A reminder that the agent owns the full loop and MUST gate every irreversible step behind explicit user approval via `AskUserQuestion`.
6. A reminder that it can spawn `design-researcher` (web research), `vscode-ux-auditor` (read-only audit), and `design-implementer` (code edits) — and SHOULD, rather than doing those tasks itself.
7. A reminder that auto mode does NOT override approval gates — even in auto mode, SPEC approval, push, and PR creation each need explicit user confirmation.

## When the agent returns

Surface its end-of-turn output verbatim — that's either an `AskUserQuestion` gate, an ideas list, an audit/research report, a SPEC summary, or a Phase 7 SUMMARY.md. Don't paraphrase. If the agent ended on an `AskUserQuestion`, the question is already shown to the user; add only a one-line framing if it improves readability.

## Don't

- **Don't do the design yourself.** This command exists to keep the work scoped inside one agent's context.
- **Don't bypass approval gates.** Even with auto mode active, the SPEC approval is a hard gate. If the user complains, point them at this command's docs — gates are a feature, not a bug.
- **Don't run `git push`, `gh pr create`, `UPDATE_SNAPSHOTS=true`, or `npm run compile` from this command's context.** The agent + sub-agents handle those inside their loops, and snapshot updates need explicit user approval per `CLAUDE.md`.
- **Don't modify files in `.planning/design/`.** That's the agent's exclusive workspace.
- **Don't modify `webview-ui/` or `cli/` source from this command's context.** Only the `design-implementer` sub-agent touches code, and only after SPEC approval.
