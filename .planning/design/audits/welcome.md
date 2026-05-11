# Local UX Audit — Welcome / "No Active Task" Home
**Date**: 2026-05-11
**Auditor**: design-architect (inline, vscode-ux-auditor delegation unavailable in environment)
**Mode**: READ-ONLY
**Files in scope**:
- `webview-ui/src/components/welcome/HomeHeader.tsx`
- `webview-ui/src/components/welcome/SuggestedTasks.tsx`
- `webview-ui/src/components/welcome/QuickWinCard.tsx`
- `webview-ui/src/components/welcome/quickWinTasks.ts`
- (referenced) `webview-ui/src/components/chat/chat-view/components/layout/WelcomeSection.tsx`
- (referenced) `webview-ui/src/App.tsx` for routing

**Files explicitly out of audit scope**:
- `welcome/WelcomeView.tsx` — only reachable from `OnboardingView`; onboarding is a separate ranked area.

---

## Pillar 1 — Theme integrity
| Severity | File:Line | Finding |
|---|---|---|
| 🟡 Medium | `HomeHeader.tsx:39` | `bg-white/2` — uses a raw color (`white`) at 2% opacity. On the dark VS Code theme this reads as a very subtle warm white wash; on light themes it produces a near-invisible dirty highlight on already-light backgrounds. Should map to a neutral overlay derived from `--vscode-toolbar-hoverBackground` or similar. |
| 🟡 Medium | `QuickWinCard.tsx:34` | Same `bg-white/2` pattern + arbitrary class. Plus mixes Tailwind shorthand (`bg-white/2`) and arbitrary VS Code variable usage (`border-(--vscode-panel-border)`) in one element — two different idioms in one className. |
| 🟢 Low | `SuggestedTasks.tsx:16` | `text-gray` and inline `text-white` — these aren't bound to theme tokens. The "Quick `[Wins]` with GenCoder" copy uses literal white which doesn't adapt to light themes; on a light VS Code theme this becomes invisible. |
| 🟡 Medium | `HomeHeader.tsx:39` | `text-code-foreground` — mapped, fine, but pairs with `bg-white/2` (unmapped). Inconsistent. |
| 🟢 Low | `QuickWinCard.tsx:41-44` | All text colors use `text-(--vscode-...)` arbitrary syntax instead of the mapped Tailwind tokens (`text-foreground`, `text-description`). The mapped tokens exist in `theme.css`; using them is more readable and survives token renames. |

**Verdict**: minor but real. `bg-white/2` is the most visible offense; `text-white` literal in the heading is the most damaging (breaks light theme).

## Pillar 2 — Information density (narrow panel, ~280px)
| Severity | Finding |
|---|---|
| 🟡 Medium | `HomeHeader.tsx:30` `my-7` on the logo container = 28px top + 28px bottom = 56px reserved for chrome before the headline even appears. Combined with `mb-5` on the outer wrapper (20px), the user spends ~76px before reading any text. On a 700px-tall panel that's ~11% of the viewport burned on a single logo. |
| 🟡 Medium | `HomeHeader.tsx:31` `size-20` (80px logo) competes with `WelcomeSection.tsx:266` `<BannerCarousel>` for vertical real estate. A 220px-tall promotional banner directly under an 80px logo creates a long un-actionable scroll region before the user reaches quick wins or history. |
| 🟢 Low | `SuggestedTasks.tsx:14` `px-4 pt-1 pb-3` is consistent and reasonable. |
| 🟡 Medium | The post-config home stack (logo + headline + optional tour button + banner + history-or-quickwins + worktree badge) can produce 5-7 stacked sections. On the 350px viewport users on narrow sidebars use, the user scrolls past brand chrome to reach action. |

**Verdict**: brand chrome is over-budgeted for the panel width.

## Pillar 3 — Consistency (primitive choice)
| Severity | File:Line | Finding |
|---|---|---|
| 🔴 High | `HomeHeader.tsx:38-44` | The "Take a Tour" affordance is a raw `<button>` with inline Tailwind, not a shadcn `Button` primitive. The codebase has `webview-ui/src/components/ui/button.tsx` ready for use. Same pattern repeats in `WelcomeSection.tsx:271-285` (the commented-out "New Worktree Window" button) and the worktree badge button at `:290-305`. |
| 🟡 Medium | `QuickWinCard.tsx:33-46` | The "card" is a raw `<div>` with `cursor-pointer` and click handler — accessibility tier-2 issue (see Pillar 4) AND not aligned with the shadcn `Item` primitive in `ui/item.tsx`. |
| 🟡 Medium | Icons are inconsistent: `codicon-rocket/dashboard/terminal/game` in `QuickWinCard.tsx`, `codicon-play` in `HomeHeader.tsx`, but `lucide-react` `GitBranch` in `WelcomeSection.tsx`. The codebase uses lucide-react per `components.json:13`. Codicon is acceptable for VS Code parity but mixing two icon families in the same view is jarring. |
| 🟢 Low | The `Tooltip`/`TooltipTrigger` usage in `WelcomeSection.tsx` correctly uses shadcn primitives — that part is good. |

**Verdict**: HIGH issue — primary CTAs in `welcome/` skip the project's button primitive entirely.

## Pillar 4 — Accessibility
| Severity | File:Line | Finding |
|---|---|---|
| 🔴 High | `QuickWinCard.tsx:33-46` | `<div onClick=…>` is not keyboard-focusable, not announceable to screen readers as an action, no `role`, no `tabIndex`, no Enter/Space key handler. Three full-bleed cards are completely keyboard-unreachable. |
| 🟡 Medium | `HomeHeader.tsx:38-44` | The "Take a Tour" button is a real `<button>` (good) but has no focus-visible ring beyond browser default — on a dark VS Code theme the default outline can be invisible. shadcn `Button` ships proper `focus-visible:ring-*` already. |
| 🟡 Medium | `HomeHeader.tsx:33-34` | `<h1>` inside the panel — there is also an `<h2>` "Quick `[Wins]` with GenCoder" sibling. Heading order is fine, but the page lacks any `<main>` or `role="main"` landmark above the home. |
| 🟢 Low | `QuickWinCard.tsx:34` icon `<span className="codicon ...">` has no `aria-hidden="true"` — small but lints will catch. |
| 🟡 Medium | No `prefers-reduced-motion` handling on the existing fade animations (`--animate-fade-in`, `--animate-fade-slide-in` in `theme.css:97,141`). If reduced motion is requested system-wide, the fade-slide still plays. |
| 🟡 Medium | `SuggestedTasks.tsx:16` `[Wins]` styling uses color contrast (`text-gray` vs `text-white`) as the only signal — on high-contrast theme the `text-white` literal breaks contrast guarantees. |

**Verdict**: HIGH issue — quick win cards fail basic keyboard accessibility.

## Pillar 5 — Microcopy
| Severity | File:Line | Finding |
|---|---|---|
| 🟡 Medium | `SuggestedTasks.tsx:16` | `Quick [Wins] with GenCoder` — marketing-flavored, bracket-emphasis pattern is unusual and inconsistent with the rest of the app's plain copy. |
| 🟡 Medium | `HomeHeader.tsx:26` | `"What can I do for you?"` is reasonable; the lazy-mode `"I guess I'm here to help"` is a personality joke — keep if intentional, but document it (no source-level comment explains the toggle's intent). |
| 🟢 Low | `quickWinTasks.ts` titles ("Build a Next.js App" / "Craft a CLI Tool" / "Develop a Game") are fine. Descriptions read like marketing taglines ("Create a beautiful notetaking app…", "Develop a powerful terminal CLI to automate a cool task") — could be tightened. |
| 🟢 Low | No bilingual support exists in this surface. GenCoder serves Arabic-speaking users; consider whether the headline should be translatable in the future. Out of scope for this cycle but flag for backlog. |

## Pillar 6 — Motion & feedback
| Severity | Finding |
|---|---|
| 🟢 Low | `HomeHeader.tsx:38` button has `transition-colors duration-150 ease-in-out` — within the ≤200ms budget, good. |
| 🟢 Low | `QuickWinCard.tsx:34` same — good. |
| 🟡 Medium | No loading / pending / error state for the case where `TaskServiceClient.newTask` (called from `SuggestedTasks.tsx:9`) fails or is slow. The user clicks a quick win card and gets… silence. Optimistic UI or a spinner on the card is missing. |
| 🟢 Low | No cold-start flicker observed in code review (state hydration is gated upstream in `App.tsx:96`). |
| 🟡 Medium | `prefers-reduced-motion` is not honored — see Pillar 4 entry. |

---

## Severity rollup
- 🔴 **High** (must fix in this SPEC): 2
  - QuickWinCard accessibility (no keyboard)
  - HomeHeader/Worktree buttons not using shadcn `Button` primitive
- 🟡 **Medium** (should fix in this SPEC): 9
- 🟢 **Low** (could fix or defer): 6

## Recommendations for SPEC
1. Convert `QuickWinCard` to use shadcn `Item` (which is keyboard-accessible by default), or wrap in a real `<button>` with appropriate styling.
2. Convert "Take a Tour" affordance to shadcn `Button` `variant="ghost" size="sm"` — and demote it visually (research P7).
3. Eliminate `bg-white/2` and `text-white` literals; introduce a `--color-subtle-overlay` token in `theme.css` if needed, or use existing `--color-muted`.
4. Reduce logo vertical budget — `my-3` instead of `my-7`, `size-14` instead of `size-20`.
5. Replace `Quick [Wins] with GenCoder` heading with plainer "Try one of these to start" or "Examples".
6. Add `prefers-reduced-motion: reduce` guards on the fade animations.
7. Add `aria-hidden="true"` on decorative codicons.
8. Add an optional model/provider status chip near the headline (research P2) — gated behind a future SPEC if it requires state plumbing.
9. Add a one-line keyboard hint footer (research P4) — only if it doesn't conflict with the composer's own hints; verify in implementation.
10. **Do not touch `WelcomeView.tsx`** — out of scope (onboarding's territory).
