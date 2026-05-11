---
description: Update the competitive-intelligence research folder (.gencoder/research/) — analyzes each GenCoder feature with pros/cons/competitor comparison/recommended additions.
argument-hint: "[feature name | 'all' | 'stale' | 'new']  (default: stale)"
allowed-tools: Task, Read, Glob
---

You are dispatching the **research-feature-analyst** subagent. It is the only agent allowed to modify `.gencoder/research/`. Your job here is just to brief it correctly and hand off.

## User's argument

`$ARGUMENTS`

Interpret it as follows:

- **empty** or `stale` → tell the agent: "Scan `.gencoder/research/` for files older than 14 days OR for features that have new commits since the file's last-update date; refresh the oldest/stalest one first. Produce exactly ONE updated file this turn and report what's next in the queue."
- `all` → tell the agent: "Do a full sweep across every entry in the Feature Coverage Map. Work through files in staleness order (oldest mtime first), but produce ONE file per turn — return a summary at the end of each so the user can interrupt or redirect. Don't batch-rewrite 24 files silently."
- `new` → tell the agent: "Only create files from the Feature Coverage Map that don't exist yet (`BROWSER_BRIDGE.md`, `DEEPSEEK_INTEGRATION.md`, `CONTEXT_MANAGEMENT.md`, `DIFF_AND_FILE_EDITS.md`, `FOCUS_CHAIN_AND_PLANS.md`, `PERMISSIONS_AND_AUTOAPPROVE.md`, `RESEARCH_MODE.md`, `TELEMETRY_AND_OBSERVABILITY.md`, `TERMINAL_EXECUTION.md`). Start with the one most relevant to GenCoder's fork-specific value: `DEEPSEEK_INTEGRATION.md`."
- **anything else** → treat it as a feature name or filename hint. Map it to the closest entry in the Feature Coverage Map (case-insensitive substring match against either the filename or the feature-area description). If ambiguous, list the top 3 candidates and ask the user which one. If clearly mapped, dispatch the agent to refresh-or-create that specific file.

## Dispatch

Before launching the agent, briefly state (1-2 sentences) which file(s) you've decided to target and why. Then launch the **research-feature-analyst** agent via the Task tool with a self-contained prompt that includes:

1. The interpreted target (specific filename, or "stale sweep", etc.).
2. A reminder that the agent owns ONLY `.gencoder/research/` and must follow the 8-section template from its system prompt.
3. The current date in ISO form so the agent can stamp "Last updated" correctly.
4. A reminder to use `Edit` over `Write` when the file exists, and to refresh the `INDEX.md` "Curated Feature Analyses" section last.

When the agent returns, surface its end-of-turn summary to the user verbatim — don't paraphrase, don't add commentary unless the user asks for it. If the agent flagged any P0 recommendations, repeat the top 3 at the top of your reply so they're visible without opening files.

## Don't

- Don't do the analysis yourself — always delegate to the agent. The whole point of the command is to keep this work scoped and the main context clean.
- Don't modify files in `.gencoder/research/` directly from this command's context.
- Don't run the agent twice in the same turn unless the user explicitly asked for multiple targets.
