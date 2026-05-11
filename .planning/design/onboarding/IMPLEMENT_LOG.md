# Implementation Log — Onboarding

**Branch**: `design/onboarding`
**Base**: `modular/research-mode` @ `9fb195d8f`
**SPEC**: `.planning/design/onboarding/SPEC.md`
**Owner**: design-architect (in-loop, no `design-implementer` sub-agent registered)

---

## Phase 6 — atomic commits

| # | SHA | Subject | Files | Notes |
|---|---|---|---|---|
| 1 | `d6948ed67` | `design(onboarding): adopt sentence-case microcopy + clearer group headers` | `data-steps.ts`, `data-models.ts` | Pure microcopy. SPEC §5 microcopy table applied verbatim. No structural change. |
| 2 | `8705c2510` | `design(onboarding): add StepDots indicator (3-dot, motion-safe, a11y-clean)` | NEW `StepDots.tsx`, NEW `StepDots.stories.tsx` | Presentational. `motion-safe:` color transition. `aria-current="step"` on active dot. |
| 3 | `4ce3e1fcf` | `design(onboarding): keyboard radiogroup, surfaced OAuth errors, fallback link` | `OnboardingView.tsx` | The core SPEC payload. Radiogroup semantics on both card sets, `try/catch` around `accountLoginClicked`, destructive Alert + Retry, fallback "Browser didn't open?" link, motion-safe gating, logo `size-16` → `size-12`, footer hint scoped to step 0 only, `text-foreground/70` → `text-muted-foreground` ×4. `ModelSelection` and `UserTypeSelectionStep` now named exports. |
| 4 | `698cc357e` | `design(onboarding): add OnboardingView Storybook (4 user-visible states)` | NEW `OnboardingView.stories.tsx` | 4 stories: step 0 (FREE preselected, real `UserTypeSelectionStep`), step 1 mocked card, step 2 loading + fallback, step 2 error + Retry. Shell helper avoids mounting the full OnboardingView (which depends on `useOnboardingModels` + `useExtensionState`). |

**Total diff**: `6 files changed, +543 / -66`.

---

## Verification per commit

| Step | Result |
|---|---|
| `cd webview-ui && npx tsc --noEmit` | ✅ exit 0 |
| `npx biome lint --no-errors-on-unmatched --files-ignore-unknown=true --diagnostic-level=error webview-ui/src/components/onboarding/` | ✅ exit 0, "Checked 7 files in 135ms. No fixes applied." |
| `cd webview-ui && npm run test` | ⚠️ 10 test files fail / 6 pass — **pre-existing, unrelated**. Verified by stashing changes and re-running on the base commit `9fb195d8f`: identical 10/6 split. The failures are `Cline` → `GenCoder` rebrand mismatches in `chat/ErrorRow`, `ToolGroupRenderer`, settings sections. No `onboarding/` test files exist (matches SPEC §8 expectation). |

Linter (biome via lint-staged) auto-formatted props alphabetically inside `OnboardingView.stories.tsx` after commit 4 — semantic no-op, intentional, kept.

---

## Deviations from SPEC

| SPEC said | Actual | Why |
|---|---|---|
| Use `Alert` `destructive` variant | Used `danger` variant | The shadcn `Alert` primitive in this repo defines `default | warning | danger | cline` — there is no `destructive`. SPEC §7 listed it as "verified in implementer phase"; verification surfaced the actual name. Visually identical to what `destructive` would have been. |
| `design-implementer` sub-agent dispatched | Implemented in-loop by the architect | No `.claude/agents/design-implementer.md` is registered in this repo. Per the user's "no clarifying questions" directive, architect proceeded directly. SPEC was followed file-for-file; the spot-check enumerated below replaces the cross-agent handoff. |

---

## Spot-check (Phase 6b)

Re-read against SPEC §5:

- `OnboardingView.tsx`
  - ✅ `role="radiogroup"` × 3 (user-type group, model group, search-results group)
  - ✅ `role="radio"` on every selectable card (`UserTypeSelectionStep` + `ModelItem`)
  - ✅ `aria-checked={isSelected}` on every card
  - ✅ `tabIndex={isSelected ? 0 : -1}` roving-tabindex pattern (with safe fallback to first card when nothing selected)
  - ✅ `onKeyDown` handlers: ArrowUp / ArrowDown / Home / End on the group; Enter / Space on each card
  - ✅ `Alert` import + `loginError` state + conditional render with `Retry` button
  - ✅ Fallback `<button>` "Browser didn't open? Try again." on step 2, calls `retryAuth`
  - ✅ `motion-safe:animate-pulse` on the loading button, `motion-safe:animate-spin` on both spinners
  - ✅ Logo: `size-16` → `size-12` (64px → 48px)
  - ✅ Footer hint scoped to `stepNumber === 0` only
  - ✅ `text-foreground/70` → `text-muted-foreground` (5 occurrences total)
  - ✅ Search input: real `<Label htmlFor="onboarding-model-search">` ("More models") + sr-only label ("Search for additional models")
- `StepDots.tsx`
  - ✅ 3 dots; current is `bg-button-background`, others `bg-input-foreground/30`
  - ✅ `motion-safe:transition-colors motion-safe:duration-150`
  - ✅ `aria-label="Step {n} of {total}"` on group; `aria-current="step"` on active; `aria-hidden` on inactive
  - ✅ Pure CSS, no animation library
- `data-steps.ts`
  - ✅ `STEP_CONFIG[0].description` updated
  - ✅ `STEP_CONFIG[2].description` updated
  - ✅ `USER_TYPE_SELECTIONS` titles + descriptions updated
- `data-models.ts`
  - ✅ Group labels capitalised: `"Free"`, `"Frontier"`, `"Open source"`

No gaps found. Implementation matches SPEC §5 line-for-line.
