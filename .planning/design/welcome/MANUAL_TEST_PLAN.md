# Manual Test Plan — Welcome
**Branch**: `design/welcome` (commits `7749733f1`, `9152ecf71`)
**SPEC**: `.planning/design/welcome/SPEC.md`
**Date**: 2026-05-11
**Estimated time**: 15–20 minutes

This is the user gate for Phase 7. Auto mode does NOT bypass it. After running
the tests below, reply with one of:

- `passed` — all tests pass → proceed to PR / next area
- `failed: <test#>` — one or more tests fail → I will dispatch a fix iteration
- `pause` — defer (branch stays on the work tree, nothing merged)

---

## Pre-test setup

1. Check out the branch:
   ```
   git checkout design/welcome
   ```
2. From the repo root:
   ```
   npm run protos        # regenerate generated types if needed
   npm run compile       # full extension build (check-types + lint + esbuild)
   ```
3. Press `F5` to launch the Extension Development Host. The new window opens
   the extension under test.
4. In the host window: open the GenCoder sidebar. If a task is already active,
   click "New task" (top toolbar) until you land on the no-active-task home
   view (the one with the logo + headline).

---

## Test 1 — Light VS Code theme + keyboard flow

**Goal**: every affordance reachable with the keyboard, focus ring visible
against a light background, no `text-white` literal artifacts.

1. In the host window: `Ctrl+Shift+P` → `Preferences: Color Theme` → select
   `Light Modern` (or any built-in light theme).
2. Confirm the GenCoder home view is fully legible:
   - Logo is small (~56px tall), centered, with comfortable top/bottom margin.
   - Headline `What can I do for you?` is dark text on light background.
   - "Take a tour" appears as a small ghost button (low contrast border) below
     the headline.
   - "Try one of these to start" heading uses the description (muted) color.
   - Three quick-win cards stack vertically, each with an icon + title +
     description.
3. Click anywhere outside the panel, then press `Tab` repeatedly. Expected
   focus order through the home affordances:
   1. "Take a tour" button
   2. Quick win card 1 — "Build a Next.js App"
   3. Quick win card 2 — "Craft a CLI Tool"
   4. Quick win card 3 — "Develop a Game"
4. On EACH focused element, confirm a visible focus ring/outline. (shadcn
   `Item` uses `focus-visible:ring-ring/50` + `focus-visible:border-ring`;
   `Button` uses `focus-visible:ring-1 focus-visible:ring-ring`.)
5. With focus on a quick-win card, press `Enter` (and separately, `Space`).
   Both should fire `newTask` and start the GenCoder agent on that prompt.
6. Pass criteria: every element reachable, every focus ring visible, no
   white-on-white "ghost" text, Enter+Space both activate.

---

## Test 2 — Dark VS Code theme

**Goal**: same checks but on dark theme — verify theme tokens flip correctly
and there's no light-only color leakage.

1. `Preferences: Color Theme` → `Dark Modern` (or `Default Dark+`).
2. Repeat steps 2–5 of Test 1.
3. Pass criteria: same as Test 1, plus:
   - The Tour button's hover state shows a subtle accent (no harsh
     bright-white background).
   - Quick win card hover state shows the VS Code list hover color (matches
     other VS Code lists like Explorer).

---

## Test 3 — High-contrast theme

**Goal**: confirm no token regressed to a literal — every text/border respects
the high-contrast tokens.

1. `Preferences: Color Theme` → `Default High Contrast` (dark) — repeat
   visual scan.
2. `Preferences: Color Theme` → `Default High Contrast Light` — repeat.
3. Pass criteria:
   - Headline (`What can I do for you?`) is fully readable in both variants.
   - "Try one of these to start" heading is readable (uses
     `--vscode-descriptionForeground`).
   - Quick win card titles are readable; descriptions are readable.
   - Card borders are visible (panel border token).
   - Focus rings remain visible (ring color is theme-aware).

---

## Test 4 — `prefers-reduced-motion`

**Goal**: confirm the spinner pauses and the hover/focus transitions don't
animate when the user prefers reduced motion.

1. Open Windows Settings → Accessibility → Visual effects → toggle
   "Animation effects" **OFF**.
2. Restart the Extension Development Host (close the host window, then `F5`
   again from the main editor window).
3. In the host window, hover a quick win card. Expected:
   - The hover background change applies **instantly** (no fade transition).
4. Click a quick win to fire it. While the API call is in flight, the icon
   should change to a loading icon. Expected:
   - The loading icon is shown but **does not spin** (the
     `motion-reduce:codicon-modifier-disable-spin` class halts the rotation).
5. Re-enable animation effects when done.
6. Pass criteria: no rotating spinner under reduced-motion; transitions
   instantaneous (no easing-in fade).

---

## Test 5 — Screen reader spot-check (optional but recommended)

**Goal**: verify ARIA wiring announces meaningfully to a screen reader.

1. Start NVDA (free, https://www.nvaccess.org) before launching the host
   window. (If NVDA unavailable, use Windows Narrator with `Win+Ctrl+Enter`.)
2. Tab through the home view.
3. Expected announcements (paraphrased):
   - Tour button: "Take a tour, button"
   - Quick win 1: "Build a Next.js App. Create a beautiful notetaking app
     with Next.js and Tailwind, button"
   - Quick win 2/3: same pattern with their own title + description
   - Region: "Suggested tasks, region" / "Try one of these to start, heading
     level 2" (announced on entry to the section)
4. Pass criteria: every interactive element identified as a button with a
   meaningful label (title + description merged). No empty / "blank" /
   "clickable" announcements.

---

## Test 6 — Regression: brand variants + worktree badge

**Goal**: the SPEC §7 risks aren't realized — Santa logo doesn't look cramped,
lazy teammate mode still works, worktree badge layout in `WelcomeSection.tsx`
still composes naturally with the smaller logo.

1. **Lazy teammate mode**: In the host window, open Settings (gear icon) →
   find the "Lazy teammate mode" toggle → enable it. Return to the home view.
   - Expected: tired logo at `size-14` (56px), headline reads `I guess I'm
     here to help`, layout is otherwise unchanged.
2. **December easter egg (Santa)**: With lazy teammate mode disabled,
   temporarily edit `webview-ui/src/components/welcome/HomeHeader.tsx`
   line 25 from `new Date().getMonth() === 11` to `true` (force December)
   and reload the host window (`Ctrl+R`).
   - Expected: Santa logo at `size-16` (64px — the special-case from SPEC §7),
     with its hat showing fully without being clipped against the top of its
     container.
   - When done, revert the line change (don't commit it).
3. **Worktree badge**: If you have a worktree-enabled workspace, scroll past
   the home view to the worktree badge in `WelcomeSection.tsx`. Confirm the
   badge layout still looks right — the smaller logo above doesn't leave a
   noticeable empty gap.
4. Pass criteria: all three brand variants render correctly; worktree badge
   spacing looks intentional, not accidentally cramped or stretched.

---

## Test 7 — Storybook visual check (optional)

**Goal**: quick visual regression via Storybook before merging.

1. From the repo root:
   ```
   cd webview-ui && npm run storybook
   ```
2. Open `http://localhost:6006`.
3. Navigate to:
   - `Welcome / HomeHeader` → run through `Default`, `WithoutTour`,
     `NarrowPanel`
   - `Welcome / QuickWinCard` → run through all 5 states
   - `Welcome / SuggestedTasks` → run through `Default`, `NarrowPanel`
4. Pass criteria: every story renders without console errors, narrow-panel
   variant doesn't overflow or wrap weirdly.

---

## Known acceptable trade-offs (NOT failures)

- `QuickWinCard` is now visually `rounded-sm` (shadcn Item default) instead of
  the previous `rounded-full` pill. This was explicit in OQ-3 (default
  approved by user): aligns with VS Code's native list-row aesthetic.
- The Tour button is now visually less prominent (ghost variant) than the
  previous filled pill. This was explicit in OQ-4 (default approved).
- Tests still report 3 pre-existing failures in `chat/` and `settings/`. These
  are NOT caused by this SPEC — confirmed by running the test suite against
  the unmodified upstream `modular/research-mode` HEAD with identical results.
  Tracked separately.

---

## After running

Reply with: `passed` / `failed: <test#>: <what went wrong>` / `pause`.
