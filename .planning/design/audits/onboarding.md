# Local UX Audit — Onboarding

**Date**: 2026-05-11
**Auditor**: design-architect (acting as vscode-ux-auditor; Task tool unavailable)
**Target**: `webview-ui/src/components/onboarding/*` — read-only

## Files in scope

- `webview-ui/src/components/onboarding/OnboardingView.tsx` (442 lines)
- `webview-ui/src/components/onboarding/data-steps.ts` (55 lines)
- `webview-ui/src/components/onboarding/data-models.ts` (90 lines)
- `webview-ui/src/components/onboarding/useOnboardingModels.ts` (108 lines)

No `__tests__/` directory — no snapshot pins to worry about.

---

## Pillar 1 — Theme integrity

| # | Finding | Severity | Location |
|---|---|---|---|
| 1.1 | All color tokens reference mapped Tailwind classes (`bg-input-background`, `text-foreground`, `stroke-success`, `stroke-button-background`). No hardcoded hex. | ✅ pass | — |
| 1.2 | `bg-input-background/80` and `bg-input-background/50` are used inconsistently for "selected" state across the two card components (model card vs user-type card). | 🟡 minor | `OnboardingView.tsx:64, 204` |
| 1.3 | `border-button-background` (sharp brand accent) on model selection, `border-input-foreground/30` on user-type — two different "selected" border treatments. | 🟡 minor | `OnboardingView.tsx:64, 204` |
| 1.4 | `text-foreground/70` is used as a "muted" treatment — works in dark theme, but in high-contrast the alpha may make it fail 4.5:1. We have `text-muted-foreground` for this purpose. | 🟠 medium | `OnboardingView.tsx:82, 83, 100, 117, 128, 181, 413` |
| 1.5 | `border-muted-foreground` used as a separator in two places — should be the `Separator` component or `border-panel`. | 🟡 minor | `OnboardingView.tsx:88, 126` |

**Verdict**: theme-clean overall; needs unification of the "selected" affordance and replacement of ad-hoc `text-foreground/70` with the canonical `text-muted-foreground`.

## Pillar 2 — Information density

| # | Finding | Severity | Location |
|---|---|---|---|
| 2.1 | Layout uses `max-w-lg` (= 32rem ≈ 512px). VS Code activity-bar panels default to ~360–420px. At 360px the cards collapse to single column — acceptable. At 280px (minimum panel width), the model-card "speed / context / price" row will wrap onto 3 lines. | 🟡 minor | `OnboardingView.tsx:95-103` |
| 2.2 | Logo is `size-16` (64px) — large for a panel. Cline upstream uses `size-12` (48px). Combined with title + description + 2 buttons + footer hint, total vertical space is 480px+ on Step 0. Panels of height <650px will scroll. | 🟠 medium | `OnboardingView.tsx:375` |
| 2.3 | Footer hint "You can change this later in settings" is repeated on every step except step 2 — adds noise without information. | 🟡 minor | `OnboardingView.tsx:413` |
| 2.4 | The "Search model..." input appears as a permanent secondary section even on Step 0 / Step 2 — wait, false alarm: it's gated behind the model-selection step. ✅ | ✅ pass | — |

**Verdict**: workable at typical panel widths; logo + density on Step 0 deserves a small tightening pass.

## Pillar 3 — Consistency

| # | Finding | Severity | Location |
|---|---|---|---|
| 3.1 | Two different `Item` variants in use (`outline` for models, default for user-types). `outline` has a visible border, default has none. **Selected state styling is also different** (`bg-input-background/80 + border-button-background` for models vs `bg-input-background/50 + border-input-foreground/30` for user-types). User experiences two different visual languages on consecutive steps. | 🔴 high | `OnboardingView.tsx:63-68, 203-207` |
| 3.2 | Button `rounded-xs` is applied explicitly in the footer (`className="w-full rounded-xs"`) — the Button primitive already has `rounded-xs` baked in. Redundant override. | 🟡 minor | `OnboardingView.tsx:403` |
| 3.3 | Loader on step 2 uses raw `<LoaderCircleIcon className="animate-spin" />` — no shadcn `Progress` component, no status text aside from the title. Other extension surfaces (e.g., welcome `HomeHeader`) use semantic loading states. | 🟠 medium | `OnboardingView.tsx:378-381, 428-430` |
| 3.4 | No use of `Alert` for the footer "you can change this later" hint — it's a manual flex row with an `AlertCircleIcon` + text. We have a shadcn `Alert` primitive. | 🟡 minor | `OnboardingView.tsx:412-416` |
| 3.5 | The "Search model" `<Input>` uses `focus-visible:border-button-background` — overrides the default `focus-visible:ring-1 focus-visible:ring-ring` from the primitive. Inconsistent focus treatment vs the rest of the app. | 🟡 minor | `OnboardingView.tsx:131` |
| 3.6 | No `Separator` primitive — the manual `border-t border-muted-foreground` (line 126) and `border-t border-muted-foreground` (line 88) reinvent the separator pattern. | 🟡 minor | `OnboardingView.tsx:88, 126` |

**Verdict**: real consistency gap, especially 3.1. The two card components should share visual language for "selected" state.

## Pillar 4 — Accessibility

| # | Finding | Severity | Location |
|---|---|---|---|
| 4.1 | **User-type cards are `<Item onClick=…>` divs** — not keyboard operable. Tab will not focus them. Enter/Space will not select. Screen readers will announce them as plain `<div>` not as a radio choice. **WCAG 2.1.1 failure.** | 🔴 high | `OnboardingView.tsx:202-217` |
| 4.2 | **Model cards have the same problem** — `<Item onClick=…>` with no role, no `tabIndex`, no aria-checked. Cannot be selected with keyboard. | 🔴 high | `OnboardingView.tsx:62-108` |
| 4.3 | No `role="radiogroup"` / `aria-label` wrapping the user-type cards. Screen reader has no semantic grouping. | 🔴 high | `OnboardingView.tsx:197-218` |
| 4.4 | The loader screen (step 2) has no `role="status"` + `aria-live="polite"`. Screen reader users won't be told what's happening. | 🟠 medium | `OnboardingView.tsx:378-381, 428-430` |
| 4.5 | The "Search model..." input has `placeholder="Search model..."` but **no associated `<Label>`**. The "other options" `<h4>` above is visually-only — not connected via `htmlFor`. | 🟠 medium | `OnboardingView.tsx:128-142` |
| 4.6 | Buttons array in footer renders `<Button>` siblings — there's no implicit group; if a future variant adds 3+ buttons, focus order may not match visual order. Today only 1-2 buttons so OK. | 🟢 info | `OnboardingView.tsx:401-410` |
| 4.7 | The "you can change this later" hint uses `AlertCircleIcon` + plain text — not in an `Alert` with `role="note"`. Screen readers may skip it. | 🟡 minor | `OnboardingView.tsx:412-416` |
| 4.8 | No `prefers-reduced-motion` consideration on the `animate-pulse` button (line 403) or `animate-spin` loader. | 🟠 medium | `OnboardingView.tsx:403, 379, 429` |
| 4.9 | Logo `<ClineLogoWhite>` — does it have alt text / role="img"? Need to verify. *(Component external; flagging as TBD in implement phase — likely already handled via decorative SVG.)* | 🟢 info | `OnboardingView.tsx:375` |

**Verdict**: this is the highest-impact pillar for this cycle. Four 🔴/🟠 a11y bugs that **block keyboard users from completing onboarding**. Fixing this is the SPEC's main justification.

## Pillar 5 — Microcopy

| # | Finding | Severity | Location |
|---|---|---|---|
| 5.1 | "How will you use GenCoder?" — clear, no marketing speak. ✅ | ✅ pass | `data-steps.ts:15` |
| 5.2 | "Absolutely Free" — slightly hype-flavored ("Absolutely" is filler). "Free" alone is clearer. | 🟡 minor | `data-steps.ts:51` |
| 5.3 | "Frontier Model" — jargon. New users may not know the term. Suggest "Premium models (paid)" or "Frontier models — Claude, GPT, Gemini". | 🟠 medium | `data-steps.ts:52` |
| 5.4 | "Bring my own API key" — fine. ✅ | ✅ pass | `data-steps.ts:53` |
| 5.5 | "Almost there!" + "Complete account creation in your browser. Then come back here to finish up." — passive. **Missing fallback**: no "didn't open?" link. | 🟠 medium | `data-steps.ts:43-46` |
| 5.6 | "Create my Account" — capitalisation inconsistent ("Account" capitalised, but "Login to GenCoder" mixed-case). Prefer sentence case throughout. | 🟡 minor | `data-steps.ts:18, 24, 30` |
| 5.7 | "You can change this later in settings" — fine, but appears redundantly on every step. Consider showing only on step 0. | 🟡 minor | `OnboardingView.tsx:414` |
| 5.8 | No Arabic / RTL support — onboarding is English-only. *(Out of scope unless flagged; the rest of the app is also English-only.)* | 🟢 info | — |
| 5.9 | API-key error states have **no microcopy at all** — `accountLoginClicked({}).catch(() => {})` silently swallows failures. The user gets no feedback if sign-in fails. | 🔴 high | `OnboardingView.tsx:336, 342` |

**Verdict**: copy is mostly clean; the silent error path (5.9) is the real bug, and the jargon on "Frontier Model" is the easy win.

## Pillar 6 — Motion & feedback

| # | Finding | Severity | Location |
|---|---|---|---|
| 6.1 | `animate-pulse` on the action button during loading — acceptable visual feedback, but no `prefers-reduced-motion` guard. | 🟠 medium | `OnboardingView.tsx:403` |
| 6.2 | `animate-spin` on the loader — same: no `prefers-reduced-motion` guard. Should fall back to a static "Loading…" text or a non-rotating glyph. | 🟠 medium | `OnboardingView.tsx:379, 429` |
| 6.3 | No transition on card-selection state change — switching user type swaps the visual instantly. Slight `transition-colors` would smooth it (≤150ms). | 🟢 info | `OnboardingView.tsx:202-217` |
| 6.4 | No optimistic feedback when "Continue" is pressed — user just sees the next screen. Adequate for fast operations. | ✅ pass | — |
| 6.5 | Step 2 "Almost there" loader has no time-bound feedback ("waiting…", "still waiting…", "didn't open?"). User has no idea if the system is alive. | 🟠 medium | `OnboardingView.tsx:378-381` |
| 6.6 | No empty-state for the "no models returned" path beyond falling back to `<WelcomeView />` — silent fallback may confuse users who saw onboarding start and then "disappear". | 🟡 minor | `OnboardingView.tsx:434-436` |

**Verdict**: motion is minimal and OK; the gap is *informational* (6.5) and *reduced-motion* (6.1, 6.2).

---

## Summary of impact

- **Pillar 4 (Accessibility)**: 4 high/medium findings — **this is the main reason to redesign**. Keyboard users cannot complete onboarding today.
- **Pillar 3 (Consistency)**: 1 high finding (3.1, mismatched selected-state styling) — visible to every user.
- **Pillar 5 (Microcopy)**: 1 high finding (5.9, silent error swallowing) — affects users with network/credential issues.
- **Pillar 1, 2, 6**: clusters of small/medium polish opportunities; combined effect is real.

## Cross-references to research

- Audit finding 5.9 (silent error) ↔ Research P6 (specific error states are table-stakes elsewhere).
- Audit finding 4.1–4.3 (keyboard-radio gap) ↔ Research P8 (WCAG 2.1.1 mandatory).
- Audit finding 5.5 (passive "Almost there") ↔ Research P5 (fallback link, retry action).
- Audit finding 3.1 (mismatched cards) ↔ no research need; pure local consistency issue.

## Out of scope flags for SPEC

- **OQ-A1**: Step 1 BYOK mounts `ApiConfigurationSection` (the full settings drawer). Per research P2, this is overwhelming for first-run; competitors curate to ~5 providers. *Defer to a future onboarding-v2 cycle that also touches settings.*
- **OQ-A2**: No API-key reveal toggle today. *Could fix as a tiny addition to the `Input` primitive — but touches a shared component; raise as Phase 5 open question.*
- **OQ-A3**: The `accountLoginClicked` flow has no observable success/failure beyond local UI. Surfacing real errors may require a proto/handler change. *Defer; for this cycle, just make the UI capable of displaying an error if one were available.*
