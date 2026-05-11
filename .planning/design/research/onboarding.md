# Competitor Research — Onboarding (first-time setup)

**Date**: 2026-05-11
**Researcher**: design-architect (acting as design-researcher; Task tool unavailable)
**Target area**: `webview-ui/src/components/onboarding/`

## Scope

How modern AI coding tools onboard a brand-new user from cold start to first chat
turn: provider selection, API key handling, model picker, post-setup transition,
and the OAuth "leave-and-return" dance.

---

## P1 — Step indicators / progress

| Tool | Pattern | Source |
|---|---|---|
| Cursor | **Implicit linear wizard** — title changes on each screen ("Import VS Code Settings", "Choose your AI model"). No "Step 2/5" chrome. Relies on a single primary button per screen. | https://hypereal.tech/a/cursor-setup-guide |
| Windsurf | **Implicit linear** — sign in → plan tier → welcome. No numbered indicator. Plan-tier screen is a 3-card row. | https://www.techcompanynews.com/how-to-use-windsurf-step-by-step-guide-for-beginners/ |
| Continue.dev | **Single-screen config** — no multi-step wizard. Opens `config.yaml` and a tutorial doc. Onboarding is "go read the docs". | https://docs.continue.dev/ide-extensions/install |
| Copilot Chat | **Auth-only** — single "Sign in to GitHub" prompt, then drops to chat. Model selection is a later affordance, not onboarding. | https://code.visualstudio.com/docs/copilot/setup |
| Zed | **Skippable** — boots straight into agent panel; model selector is in the message editor (cmd-alt-/) when needed. No onboarding screen at all. | https://zed.dev/docs/ai/agent-panel |
| Cline upstream | **Same pattern GenCoder inherited** — implicit linear, recently switched to dynamically-fetched recommended models. | https://deepwiki.com/cline/cline/1.2-getting-started |

**Principle**: an explicit "1/3 → 2/3" indicator is rare in this category. The
trend is **implicit progress via title + primary CTA**. A subtle non-numeric
indicator (3 dots, a thin progress bar) helps orientation without feeling
bureaucratic. Numbered steps feel like enterprise SaaS — out of place in a
developer tool.

## P2 — Provider / model picker UX

| Tool | Pattern | Source |
|---|---|---|
| Cursor | **Default model preselected**; user can switch later. First-run UX nudges Claude 3.5 Sonnet "for speed" — opinion-led default. | https://hypereal.tech/a/cursor-setup-guide |
| Windsurf | **Card row** with 3 plan tiers. Model picker is a popover from the message editor, never a full screen. | https://windsurf.com/cascade |
| Continue.dev | **"Use your own API key" + provider chips**. OpenRouter is the recommended escape hatch when free trial runs out. | https://docs.continue.dev/customize/model-providers/top-level/openai |
| Zed | **"Hosted vs BYOK" toggle**. Hosted default is Claude Sonnet 4.5 (agent) + GPT-5-nano (fast). Provider list is a settings concern. | https://zed.dev/docs/ai/configuration |

**Principles**:
1. **Pick a default. Aggressively.** A pre-selected model removes a decision the
   first-time user shouldn't have to make. GenCoder already does this (auto-
   selects first model when user-type changes) — keep this behaviour.
2. **Three tiers, not thirty.** None of these tools show a flat list of every
   provider on first run. They group as: free/hosted → frontier → bring-your-own.
   GenCoder's existing 3-card user-type pick (FREE / POWER / BYOK) matches the
   convention. Don't break it.
3. **OpenRouter as the catch-all "more options" escape**, not as a peer of the
   premium models. Today GenCoder buries it in BYOK; this is correct.

## P3 — API-key affordances

| Tool | Pattern | Source |
|---|---|---|
| Continue.dev | **"Get your API key" link adjacent to the input** + secret env-var syntax `${{ secrets.X }}` for power users. | https://docs.continue.dev/customize/model-providers/top-level/openai |
| Cursor | Settings → API Keys; not in first-run flow. | https://hypereal.tech/a/cursor-setup-guide |
| Cline | API-key input inside provider section; relies on link-to-docs in the same row. | https://deepwiki.com/cline/cline/1.2-getting-started |

**Principles**:
1. **Always show the "where do I get this key?" link** inline with the input.
   Otherwise the user leaves to Google for the URL and may not come back.
2. **Mask by default, reveal on toggle** — standard pattern; GenCoder's
   `<input type="password">` already implements masking, but no reveal toggle
   today.
3. **Paste-friendly**: large hit target, no autocorrect, monospace font to
   visually confirm the key shape (`sk-ant-…`).
4. **No client-side validation of key format**. Per Stytch/AX-friendly-error
   guidance, **wait for the server to validate**, then surface a specific error
   ("token missing" vs "token invalid" vs "insufficient scope") rather than a
   generic "invalid input". Avoids false rejection of new key formats.
   Source: https://stytch.com/blog/if-an-ai-agent-cant-figure-out-how-your-api-works-neither-can-your-users/

## P4 — Post-setup transition

| Tool | Pattern | Source |
|---|---|---|
| Cursor | **Lands on welcome with quick-start tips** and a Cmd-K demo. | https://hypereal.tech/a/cursor-setup-guide |
| Windsurf | **Welcome page with quick actions** ("open a folder", "configure settings"). | https://www.techcompanynews.com/how-to-use-windsurf-step-by-step-guide-for-beginners/ |
| Zed | **Drops directly into the agent panel** — no celebration screen. | https://zed.dev/docs/ai/agent-panel |
| Cline | **WelcomeView** — same as GenCoder today. | (parent fork) |

**Principle**: GenCoder's existing flow (onboarding done → `setShowWelcome(false)`
→ Welcome's home with header + suggested tasks) **already aligns** with this
convention. No celebration modal needed; the home is the reward.

## P5 — OAuth round-trip ("leave and come back")

| Tool | Pattern | Source |
|---|---|---|
| Copilot Chat | Browser-redirect for GitHub OAuth; uses VS Code's native auth UI; sign-in completes the flow asynchronously. | https://code.visualstudio.com/docs/copilot/setup |
| Cline | Same `accountLoginClicked` pattern as GenCoder; shows a loader on the "Almost there" screen. | (parent fork) |

**Principle**: Step 2 ("Almost there!") in GenCoder is correct but **passive** —
just a spinner. Competitors add:
- A clearer description of what happens next ("we opened your browser; sign in
  there, then come back here").
- A **fallback link** if the browser didn't open ("Didn't open? Click here.").
- A **resend** action if the user closes the browser tab by accident.

Today GenCoder only has "Back". This is a real gap.

## P6 — Error states

| Tool | Pattern | Source |
|---|---|---|
| Stytch (referenced for AX best-practice) | **Verbose error text + doc link in the body**. "Invalid API key. Get a new one at https://…". | https://stytch.com/blog/if-an-ai-agent-cant-figure-out-how-your-api-works-neither-can-your-users/ |
| GitHub Copilot Chat | Distinguishes "token missing" vs "token invalid" in error toasts. | https://docs.github.com/copilot/troubleshooting-github-copilot |

**Principle**: at the API-key validation moment, the error must include
**(a)** what went wrong specifically, **(b)** a one-click recovery (retry or
re-paste), **(c)** a "where do I get a new key" link. GenCoder today fires
silent network errors via `.catch(() => {})` — **no surface** for the user.
This is the highest-impact improvement opportunity.

## P7 — Skip / explore option

| Tool | Pattern | Source |
|---|---|---|
| Zed | No explicit skip — boots straight to panel; "configure later" is the default state. | https://zed.dev/docs/ai/agent-panel |
| Cursor | Cannot skip — provider must be set before chat. | https://hypereal.tech/a/cursor-setup-guide |
| Windsurf | Cannot skip — sign-in mandatory. | https://www.techcompanynews.com/how-to-use-windsurf-step-by-step-guide-for-beginners/ |

**Principle**: a "skip / explore later" link is not table-stakes in this
category. **Don't add one** unless we have a clear "browse-only" mode — which
GenCoder doesn't have today.

## P8 — Accessibility & keyboard navigation

| Source | Finding |
|---|---|
| USWDS step-indicator accessibility tests | Step components must be screen-reader-readable, with `aria-current="step"` on the active step and 4.5:1 contrast on labels. | https://designsystem.digital.gov/components/step-indicator/accessibility-tests/ |
| WCAG 2.1.1 | All interactive elements operable by keyboard alone, no traps, visible focus indicators. | https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html |
| WebAIM | Focus indicators must not be removed (`outline:none` is a regression); Tab/Shift+Tab/Enter/Space coverage required. | https://webaim.org/techniques/keyboard/ |

**Principles applied to onboarding**:
1. The user-type cards (currently `<Item onClick=…>`) are likely **not keyboard
   operable** as written — must verify in audit. Need `role="radio"`,
   `aria-checked`, arrow-key navigation between cards. This is a Pillar-4 finding.
2. Primary button on each screen must be the default tab target (Enter to advance).
3. The "Almost there" loader screen needs `role="status"` + `aria-live="polite"`
   so screen readers announce the wait.

---

## Patterns to bring into GenCoder (synthesized)

1. **Lightweight non-numeric progress dots** above the title — orients the user
   without enterprise-flavored "Step 2 of 3" chrome. (P1)
2. **Inline "where do I get this key?" link** next to API-key inputs, plus a
   reveal-toggle button. (P3)
3. **Specific error surface** for API-key validation failures, with retry action
   and doc link. Catches the silent-failure gap in `accountLoginClicked`. (P6)
4. **Richer "Almost there" screen** — clearer copy, fallback "retry browser
   redirect" link, optional "sign in failed?" affordance. (P5)
5. **Keyboard-radio semantics** on the user-type and model cards — arrow nav,
   `aria-checked`, Enter to confirm. (P8)
6. **`aria-live` on the loader screen** so the wait is announced. (P8)

## Patterns to deliberately NOT copy

- Numbered step indicator ("1/3, 2/3") — feels enterprise.
- Celebration modal ("You're all set!") — Welcome home already serves this role.
- A "skip / explore later" link — no browse-only mode to back it.
- Provider brand-color cards (Cursor uses neutralized cards, not provider
  brand-painted ones) — keep our theme-neutral aesthetic.

## Open questions raised by research

- **OQ-R1**: Should the BYOK step expose a curated subset of providers (Anthropic,
  OpenAI, Gemini, OpenRouter, Ollama) instead of the full provider settings
  drawer? Today it mounts `ApiConfigurationSection` which is the same monolith
  shown in settings — overwhelming on first run. *Recommendation*: out of scope
  this cycle (would touch settings refactor); flag for next cycle.

## Sources

- [Cursor AI Setup Guide 2026](https://hypereal.tech/a/cursor-setup-guide)
- [Windsurf Cascade docs](https://docs.windsurf.com/windsurf/cascade/cascade)
- [Windsurf beginner guide](https://www.techcompanynews.com/how-to-use-windsurf-step-by-step-guide-for-beginners/)
- [Continue.dev install docs](https://docs.continue.dev/ide-extensions/install)
- [Continue.dev OpenAI provider config](https://docs.continue.dev/customize/model-providers/top-level/openai)
- [VS Code Copilot Chat setup](https://code.visualstudio.com/docs/copilot/setup)
- [Cline installation (DeepWiki)](https://deepwiki.com/cline/cline/1.2-getting-started)
- [Zed agent panel docs](https://zed.dev/docs/ai/agent-panel)
- [Zed AI configuration](https://zed.dev/docs/ai/configuration)
- [Stytch — AI-friendly error design](https://stytch.com/blog/if-an-ai-agent-cant-figure-out-how-your-api-works-neither-can-your-users/)
- [USWDS step indicator a11y tests](https://designsystem.digital.gov/components/step-indicator/accessibility-tests/)
- [WCAG 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
- [WebAIM keyboard accessibility](https://webaim.org/techniques/keyboard/)
