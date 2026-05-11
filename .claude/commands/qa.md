---
description: Launch the qa-release-engineer agent to run a full QA cycle on GenCoder — type-check, lint, tests, compile, build the VSIX installer, inspect it, and produce a structured pass/fail report. Use `/qa full` before tagging a release; `/qa smoke` for quick pre-commit checks.
argument-hint: "[smoke | quick | full | vsix | report | fix]  (default: smoke)"
allowed-tools: Task, Read, Glob, Bash, AskUserQuestion
---

You are dispatching the **qa-release-engineer** agent. It owns the full QA loop (pre-flight → type-check → lint → tests → compile → package VSIX → inspect VSIX → structured report → verdict). Your job here is to brief it correctly and hand off — do NOT do the work yourself.

## User's argument

`$ARGUMENTS`

Interpret it as follows:

- **empty** or `smoke` → tell the agent: "Smoke mode. Run `check-types` and `lint` only. Goal: fast sanity check before commit. No tests, no compile, no VSIX. Produce the report in `.planning/qa/<run-id>/REPORT.md` and surface the verdict."

- `quick` → tell the agent: "Quick mode. Run `check-types`, `lint`, and `compile`. Goal: pre-push validation. No tests, no VSIX. Produce the report and surface the verdict."

- `full` → tell the agent: "Full mode. Run the complete pipeline: protos (if proto files changed), `check-types`, `lint`, `compile`, `build:webview`, `test:unit`, snapshot drift check, `package`, `vsce package --out dist/gencoder-qa-<run-id>.vsix`, then dispatch `vsix-package-inspector` on the produced VSIX. Goal: ship-readiness verdict. Produce the report and the Manual Smoke section."

- `vsix` → tell the agent: "VSIX-only mode. Assume types/compile/tests already passed in a prior run. Produce a fresh VSIX with `npx @vscode/vsce package --allow-package-secrets sendgrid --out dist/gencoder-qa-<run-id>.vsix`, dispatch `vsix-package-inspector` on it, and report. Used when the user just wants the installer."

- `report` → tell the agent: "Report mode. No execution. Read `.planning/qa/LATEST` to find the most recent run-id, then read its `REPORT.md` and re-summarize for the user in ≤200 words. If no prior run exists, tell the user and recommend `/qa smoke` to bootstrap."

- `fix` → tell the agent: "Fix mode. Read the latest `.planning/qa/<run-id>/REPORT.md`. For each finding marked auto-fixable (risk 1-2), apply the fix, re-run the affected step only, and append to `FIX-LOG.md`. Stop after 3 fixes or after any failure that needs human input. Do NOT commit. Surface the updated verdict + remaining findings via `AskUserQuestion`."

- **anything else** → if it's a step name (`types`, `lint`, `tests`, `compile`, `package`), map to the closest mode (`types`/`lint` → `smoke`, `tests` → `full`, etc.) and tell the user which mode you picked. If unclear, ask via `AskUserQuestion` with the 6 modes as options.

## Pre-flight checks (do these before dispatching the agent)

Run these in parallel:

1. **Git state**: `git -C c:/gencoder status --short` and `git -C c:/gencoder branch --show-current`. Surface to the agent so it doesn't re-discover.
2. **Node/npm versions**: `node --version`, `npm --version`. Pass to the agent.
3. **node_modules presence**: check `c:/gencoder/node_modules` and `c:/gencoder/webview-ui/node_modules`. If either is missing, warn the user via `AskUserQuestion`: "node_modules missing in `<path>` — run `npm run install:all` first, or proceed and let the agent fail fast?"
4. **Mode sanity for `full`**: confirm `dist/` is writable and the user is okay with `dist/gencoder-qa-*.vsix` being created. If multiple prior QA artifacts already exist, mention it but don't block.
5. **`report` / `fix` modes**: confirm `.planning/qa/LATEST` exists. If not, tell the user "no prior run found — start with `/qa smoke` or `/qa full`" and stop.

If any pre-flight blocks dispatch, surface the issue with `AskUserQuestion` BEFORE launching the agent.

## Dispatch

State in 1-2 sentences which mode you've picked and why. Then launch the **qa-release-engineer** agent via the `Task` tool with a self-contained prompt that includes:

1. The current date in ISO form (so artifacts are stamped correctly).
2. The interpreted mode.
3. Git state from your pre-flight (branch, dirty/clean, SHA).
4. Node and npm versions.
5. A reminder that the agent owns the full loop and MUST NOT commit, tag, push, or publish.
6. A reminder that auto mode does NOT override the "fix only after approval" gate.
7. A reminder that for `full` mode, the agent must dispatch the `vsix-package-inspector` sub-agent (not inspect the VSIX itself).

Example dispatch prompt skeleton:

```
Today's date is {YYYY-MM-DD}. Run the GenCoder QA pipeline in **{mode}** mode.

Pre-flight context (from the dispatching command):
- Branch: {branch}
- HEAD: {short-sha}
- Working tree: {clean | N files modified}
- Node: {version}, npm: {version}
- node_modules: present at root and webview-ui

Your assignment:
{mode-specific instruction from the table above}

Hard reminders:
- Do not commit, tag, push, or publish.
- Do not run `npm install` without asking.
- For `full` mode, dispatch the `vsix-package-inspector` sub-agent for step 10 — do not inspect the VSIX yourself.
- Auto mode does NOT override the "ask before fixing code" gate.
- Write the report to `.planning/qa/<run-id>/REPORT.md` and update `.planning/qa/LATEST` to point to this run-id.
- End your turn with `AskUserQuestion` surfacing the Next Actions multi-choice.
```

## When the agent returns

Surface its end-of-turn output verbatim — that's the verdict + AskUserQuestion. Don't paraphrase the report; just frame it with one line if it improves readability ("QA cycle complete — verdict: ✅ READY. Highlights below.").

If the agent ended on a Phase 0 blocker (missing node_modules, on `main` branch, etc.) and asked the user something, just relay that question.

## Don't

- **Don't run the pipeline yourself.** This command exists to keep the work scoped inside the agent's context.
- **Don't paraphrase the verdict.** The agent's wording matters — verdict colors, manual smoke steps, exact file paths in findings.
- **Don't commit or push** from this command's context — neither this command nor its agent are authorized for git mutations.
- **Don't suggest `/release` or `/hotfix-release`** unless the agent's verdict is ✅ READY. Those workflows assume QA already passed.
- **Don't try to fix findings yourself.** That's the agent's `fix` mode, gated on user approval.
