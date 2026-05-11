# Competitor Research — Welcome / "No Active Task" Home
**Date**: 2026-05-11
**Researcher**: design-architect (inline, design-researcher delegation unavailable in environment)
**Target surface**: `webview-ui/src/components/welcome/` rendered via `WelcomeSection.tsx` when no active task is running
**Note**: `welcome/WelcomeView.tsx` is only reached via `OnboardingView` and is OUT of this cycle's scope (onboarding is its own ranked area).

---

## Scope reminder
This research targets the **post-config home** — the screen a returning user sees on every cold start once they have credentials configured. It is NOT the first-install onboarding wizard.

The current GenCoder home renders (top to bottom): centered logo, headline, optional "Take a Tour" pill button, dismissible banner carousel, history preview OR three "Quick Wins" task pills, and (conditionally) a worktree badge.

---

## Competitor scan (patterns, not pixels)

### 1. Cursor (3.x interface)
- **First-paint hierarchy** — Cursor's empty state in the AI sidebar leans on a **single dominant input** (the chat composer) rather than a logo+CTA hero. The model picker and mode toggle sit inline with the composer; there is no separate "welcome card."
- **Cold-start cues** — when no thread is active, the empty chat shows muted helper text inline (e.g., "Plan, code, or ask a question") + keyboard shortcut hints (`⌘K`, `⌘L`).
- **Quick suggestions** — Cursor surfaces **recent threads** in a collapsible list above the composer, not pre-canned tutorial tasks. Their bet: "you already know what to do; we just need to get out of the way."
- **Brand presence** — minimal. Logo is in the title bar; the canvas itself is utilitarian.
- **Source**: [cursor.com/changelog/3-0](https://cursor.com/changelog/3-0), [Cursor first-time setup guide](https://daily.dev/blog/setup-cursor-first-time/)

### 2. Windsurf (Cascade panel)
- **Recent-projects-first** — Windsurf's welcome surface emphasizes **recent projects** prominently, calling out "the things that weren't there" as a design philosophy. Quiet, minimalist, no kitchen-sink AI affordances.
- **Quick-actions strip** — open folder, configure settings, sign in. Utilitarian tiles, no marketing copy.
- **Cascade panel idle state** — when the right-side AI panel is idle, it shows model status + an empty composer. No tour button, no logo splash.
- **Source**: [Windsurf Getting Started](https://docs.windsurf.com/windsurf/getting-started), [Windsurf vs Cursor comparison](https://www.makeuseof.com/free-cursor-ide-alternative-windsurf/)

### 3. Continue.dev
- **Interactive tutorial** — Continue invests in an in-panel tutorial walking through four core features. The empty state is **didactic**, treating welcome as a teaching surface, not a "get started" funnel.
- **Source**: [Continue Quick Start](https://docs.continue.dev/ide-extensions/quick-start)

### 4. Zed AI (Agent Panel)
- **Agent selector + new-thread menu** — empty state surfaces the agent picker prominently on the left and a "New Thread…" affordance. Implies users can switch agents (Zed Agent, external agents) before typing.
- **Keyboard-first** — `⌘+Shift+A` to toggle the panel, `/` for slash commands inside it. Discoverability via command palette, not in-panel hints.
- **Source**: [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel)

### 5. Cline upstream (parent project)
- **Same lineage as GenCoder** — uses the same HomeHeader/SuggestedTasks pattern. Setup is sidebar-chat-with-gear-icon-driven. The "Get started" cluster is conceptually identical to what GenCoder ships today.
- **Source**: [Cline marketplace listing](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev), [Cline Quick Start](https://deepwiki.com/cline/cline/1.3-quick-start-guide)

### 6. JetBrains AI Assistant
- **Hint chips in code** — JetBrains pioneered inline `Alt+F` keyboard hint chips at points of relevant action. Their AI side panel emphasizes shortcuts the user can learn-by-doing.
- **Source**: [JetBrains AI Assistant keyboard shortcuts](https://www.jetbrains.com/help/ai-assistant/ai-keyboard-shortcuts.html)

---

## Distilled principles (what's worth borrowing)

| # | Principle | Seen in | How it could land in GenCoder |
|---|---|---|---|
| P1 | **Don't dominate first paint with branding** | Cursor, Windsurf | Reduce logo size, demote brand hero. The user came to do work — get out of the way. |
| P2 | **Surface "where am I?" status** — provider + model name visible at rest | Windsurf, Zed | Add a compact, non-clickable model/provider chip near the composer or below the headline. Reassurance, not a CTA. |
| P3 | **Recents over tutorials, for returning users** | Cursor, Windsurf | We already do this via `HistoryPreview` when `taskHistory.length > 0`. Keep but visually elevate. |
| P4 | **Keyboard hint as a quiet teacher** | JetBrains, Zed | Add a one-line keyboard hint footer ("Press `/` for commands · `@` to mention files") near the composer. Never modal. |
| P5 | **Three quick wins is plenty — but they should feel like the user's tasks, not templates** | (counter to current pattern) | Replace marketing-styled `[Wins]` heading with declarative "Try one of these to start". Drop the bracketed-word stylistic flourish. |
| P6 | **Quiet over busy** | Windsurf explicitly | Reduce simultaneous visual elements on cold start. Banner carousel + history + worktree + quick wins + tour button can all collide on a narrow panel. |
| P7 | **No "Take a Tour" pill in the hero** — discoverable from a menu, not promoted | Cursor, Windsurf | The current pill is loud and sits next to the logo. Demote it to a smaller, secondary link below or remove and re-surface via menu. |
| P8 | **Logo personality is fine if it's small** | Cursor (gradient), Aider (logo) | Keep ClineLogoVariable/Santa/Tired tradition — it's brand equity — but at a smaller render size so it doesn't crowd. |
| P9 | **No marketing-flavored microcopy** | All competitors | "Quick `[Wins]` with GenCoder" → "Try one of these" or "Examples". Drop the bracket-emphasis pattern. |
| P10 | **Visual rhythm matches VS Code's other side panels** (Source Control, Explorer) | n/a — VS Code's own design | Section headings styled like VS Code's collapsible section headers; spacing scale Tailwind 2/3/4, not 5/6/7. |

---

## Anti-patterns to avoid
- ❌ Lifting Cursor's "Composer" naming or Windsurf's "Cascade" wave motif — both trademarked / brand-identifiable.
- ❌ Copying Continue's didactic tutorial — GenCoder has no analog and bolting one on creates a half-feature.
- ❌ Adding a "kitchen-sink" array of AI fix buttons (Cursor's overreach per the makeuseof comparison).

---

## Open questions surfaced by research
- **OQ-R1** — Should the "Quick Wins" feature even exist for non-hosted users? It's gated on `isProdHostedApp` already. Keep it as-is for hosted, hide for self-hosted? **Decision deferred to SPEC.**
- **OQ-R2** — Lazy Teammate Mode logo (`ClineLogoTired`) and December (`ClineLogoSanta`) — keep these easter eggs? Per principle of brand personality (P8), yes, but consider whether the headline "I guess I'm here to help" stays declarative.

---

## Sources
- [Cursor 3.0 changelog](https://cursor.com/changelog/3-0)
- [Cursor first-time setup](https://daily.dev/blog/setup-cursor-first-time/)
- [Windsurf Getting Started](https://docs.windsurf.com/windsurf/getting-started)
- [Cascade product page](https://windsurf.com/cascade)
- [Windsurf vs Cursor — makeuseof](https://www.makeuseof.com/free-cursor-ide-alternative-windsurf/)
- [Continue Quick Start](https://docs.continue.dev/ide-extensions/quick-start)
- [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel)
- [Cline marketplace](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)
- [Cline Quick Start (DeepWiki)](https://deepwiki.com/cline/cline/1.3-quick-start-guide)
- [JetBrains AI keyboard shortcuts](https://www.jetbrains.com/help/ai-assistant/ai-keyboard-shortcuts.html)
